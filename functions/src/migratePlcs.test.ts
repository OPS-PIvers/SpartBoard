// Unit tests for `runMigratePlcs` (Decision 6.1).
//
// Mirrors `plcQuizSyncJoin.test.ts`: we exercise the exported core loop with a
// stub Firestore rather than the `onCall` wrapper. The wrapper's auth/admin
// gating is trivial; the interesting invariants — arrays→members synthesis,
// exactly-one-lead, leadUid mirror, orgId inference, aggregates seeding, and
// idempotency — all live in `runMigratePlcs` / `planMigration`.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module-level admin init no-ops; FieldPath.documentId() returns a sentinel
// the stub query ignores; serverTimestamp sentinel is asserted by identity.
const SERVER_TS = '__SERVER_TS__';
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldPath: { documentId: vi.fn(() => '__name__') },
    FieldValue: { serverTimestamp: vi.fn(() => SERVER_TS) },
  }),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_opts: unknown, handler: unknown) => handler),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// functionsInit side-effect — no-op in tests.
vi.mock('./functionsInit', () => ({}));

// Org-domain resolution is stubbed per-test via this mock.
const resolveOrgIdForDomain = vi.fn<
  (db: unknown, domain: string) => Promise<string | null>
>(() => Promise.resolve(null));
vi.mock('./classlinkShared', () => ({
  resolveOrgIdForDomain: (db: unknown, domain: string) =>
    resolveOrgIdForDomain(db, domain),
}));

import { runMigratePlcs } from './migratePlcs';

// ---------------------------------------------------------------------------
// Stub Firestore
// ---------------------------------------------------------------------------

interface PlcFixture {
  id: string;
  data: Record<string, unknown>;
  /** docs in /plcs/{id}/contributions (only count matters). */
  contributions?: number;
  /** existing /plcs/{id}/aggregates/_migration doc present? */
  aggregatesMarker?: boolean;
}

interface CapturedSet {
  path: string;
  patch: Record<string, unknown>;
  merge: boolean;
}

interface StubState {
  plcs: PlcFixture[];
  /** uid → /users/{uid} doc data (for displayName lookups). */
  users: Record<string, Record<string, unknown>>;
  sets: CapturedSet[];
  commits: number;
}

function makeDb(state: StubState) {
  const plcById = new Map(state.plcs.map((p) => [p.id, p]));

  const docRef = (path: string) => ({
    __path: path,
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
    get: () => getDoc(path),
  });
  const collectionRef = (path: string): Record<string, unknown> => ({
    __path: path,
    doc: (id: string) => docRef(`${path}/${id}`),
    orderBy: () => collectionRef(path),
    limit: () => collectionRef(path),
    startAfter: () => collectionRef(path),
    get: () => getCollection(path),
  });

  const getDoc = (path: string): Promise<unknown> => {
    // /users/{uid}
    const userMatch = /^users\/([^/]+)$/.exec(path);
    if (userMatch) {
      const u = state.users[userMatch[1]];
      return Promise.resolve({ exists: !!u, data: () => u });
    }
    // /plcs/{id}/aggregates/_migration
    const aggMatch = /^plcs\/([^/]+)\/aggregates\/_migration$/.exec(path);
    if (aggMatch) {
      const plc = plcById.get(aggMatch[1]);
      return Promise.resolve({ exists: !!plc?.aggregatesMarker });
    }
    throw new Error(`Unexpected getDoc: ${path}`);
  };

  const getCollection = (path: string): Promise<unknown> => {
    // /plcs/{id}/contributions  (limit(1))
    const contribMatch = /^plcs\/([^/]+)\/contributions$/.exec(path);
    if (contribMatch) {
      const plc = plcById.get(contribMatch[1]);
      const n = plc?.contributions ?? 0;
      return Promise.resolve({ empty: n === 0, size: Math.min(n, 1) });
    }
    throw new Error(`Unexpected getCollection: ${path}`);
  };

  // The top-level /plcs query goes through a chained object that finally
  // resolves .get(); we special-case it so the loop can page.
  let plcsServed = false;
  const plcsQuery = {
    __path: 'plcs',
    orderBy: () => plcsQuery,
    limit: () => plcsQuery,
    startAfter: () => plcsQuery,
    get: () => {
      // Single page (fixtures are small); second call returns empty.
      if (plcsServed) {
        return Promise.resolve({ empty: true, size: 0, docs: [] });
      }
      plcsServed = true;
      const docs = state.plcs.map((p) => ({
        id: p.id,
        __id: p.id,
        ref: docRef(`plcs/${p.id}`),
        data: () => p.data,
      }));
      return Promise.resolve({
        empty: docs.length === 0,
        size: docs.length,
        docs,
      });
    },
  };

  return {
    collection: (name: string) => {
      if (name === 'plcs') return plcsQuery;
      return collectionRef(name);
    },
    batch: () => ({
      set: (
        ref: { __path: string },
        patch: Record<string, unknown>,
        opts?: { merge?: boolean }
      ) => {
        state.sets.push({
          path: ref.__path,
          patch,
          merge: opts?.merge === true,
        });
      },
      commit: () => {
        state.commits += 1;
        return Promise.resolve();
      },
    }),
  };
}

function run(state: StubState) {
  const db = makeDb(state) as unknown as Parameters<typeof runMigratePlcs>[0];
  return runMigratePlcs(db, () => SERVER_TS);
}

function setFor(state: StubState, plcId: string): CapturedSet | undefined {
  return state.sets.find((s) => s.path === `plcs/${plcId}`);
}

let state: StubState;

beforeEach(() => {
  resolveOrgIdForDomain.mockReset();
  resolveOrgIdForDomain.mockResolvedValue(null);
  state = { plcs: [], users: {}, sets: [], commits: 0 };
});

// ---------------------------------------------------------------------------
// arrays → members map
// ---------------------------------------------------------------------------

describe('runMigratePlcs - arrays → members map', () => {
  it('synthesizes a members map from legacy arrays with correct roles + lead', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Team A',
          leadUid: 'lead-uid',
          memberUids: ['lead-uid', 'member-uid'],
          memberEmails: {
            'lead-uid': 'lead@school.org',
            'member-uid': 'member@school.org',
          },
        },
      },
    ];
    state.users = { 'lead-uid': { displayName: 'Ada Lead' } };

    const res = await run(state);
    expect(res.migrated).toBe(1);

    const patch = setFor(state, 'plc-1')!.patch;
    const members = patch.members as Record<string, Record<string, unknown>>;
    expect(Object.keys(members).sort()).toEqual(['lead-uid', 'member-uid']);
    expect(members['lead-uid'].role).toBe('lead');
    expect(members['lead-uid'].displayName).toBe('Ada Lead');
    expect(members['lead-uid'].email).toBe('lead@school.org');
    expect(members['lead-uid'].status).toBe('active');
    expect(members['lead-uid'].joinedAt).toBe(SERVER_TS);
    expect(members['member-uid'].role).toBe('member');
    // No /users doc for member-uid → falls back to email local-part.
    expect(members['member-uid'].displayName).toBe('member');
  });

  it('backfills the leadUid + memberUids + memberEmails mirrors from the map', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Team A',
          leadUid: 'lead-uid',
          memberUids: ['lead-uid', 'member-uid'],
          memberEmails: {
            'lead-uid': 'Lead@School.org',
            'member-uid': 'member@school.org',
          },
        },
      },
    ];
    const patch = (await run(state), setFor(state, 'plc-1')!.patch);
    expect(patch.leadUid).toBe('lead-uid');
    expect((patch.memberUids as string[]).sort()).toEqual([
      'lead-uid',
      'member-uid',
    ]);
    // Emails lowercased.
    expect(patch.memberEmails).toEqual({
      'lead-uid': 'lead@school.org',
      'member-uid': 'member@school.org',
    });
    expect(patch.membersMigratedAt).toBe(SERVER_TS);
  });

  it('promotes the first active member to lead when leadUid is missing', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'No Lead',
          // leadUid absent
          memberUids: ['zeta-uid', 'alpha-uid'],
          memberEmails: {
            'zeta-uid': 'zeta@school.org',
            'alpha-uid': 'alpha@school.org',
          },
        },
      },
    ];
    const patch = (await run(state), setFor(state, 'plc-1')!.patch);
    const members = patch.members as Record<string, Record<string, unknown>>;
    // Deterministic promotion = lowest uid ('alpha-uid').
    expect(members['alpha-uid'].role).toBe('lead');
    expect(members['zeta-uid'].role).toBe('member');
    expect(patch.leadUid).toBe('alpha-uid');
  });

  it('promotes the first active member to lead when leadUid is a non-string (invalid)', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Garbage Lead',
          // leadUid is a non-string → treated as no-lead (isNonEmptyString
          // guard rejects it). The first active member is promoted.
          leadUid: 42,
          memberUids: ['zeta-uid', 'alpha-uid'],
          memberEmails: {
            'zeta-uid': 'zeta@school.org',
            'alpha-uid': 'alpha@school.org',
          },
        },
      },
    ];
    const patch = (await run(state), setFor(state, 'plc-1')!.patch);
    const members = patch.members as Record<string, Record<string, unknown>>;
    expect(Object.keys(members).sort()).toEqual(['alpha-uid', 'zeta-uid']);
    const activeLeads = Object.values(members).filter(
      (m) => m.role === 'lead' && m.status === 'active'
    );
    // Exactly one lead, deterministically the lowest uid ('alpha-uid').
    expect(activeLeads).toHaveLength(1);
    expect(activeLeads[0].uid).toBe('alpha-uid');
    expect(members['zeta-uid'].role).toBe('member');
    expect(patch.leadUid).toBe('alpha-uid');
  });

  it('keeps exactly one lead when leadUid dangles to a non-member uid', async () => {
    // A leadUid that names someone absent from memberUids/emails is folded
    // into the union (a member entry is synthesized for it). The invariant
    // that matters post-migration is "exactly one active lead, mirrored by
    // leadUid" — which must hold even for this corrupt input.
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Dangling Lead',
          leadUid: 'ghost-uid',
          memberUids: ['alpha-uid'],
          memberEmails: { 'alpha-uid': 'alpha@school.org' },
        },
      },
    ];
    const patch = (await run(state), setFor(state, 'plc-1')!.patch);
    const members = patch.members as Record<string, Record<string, unknown>>;
    const activeLeads = Object.values(members).filter(
      (m) => m.role === 'lead' && m.status === 'active'
    );
    expect(activeLeads).toHaveLength(1);
    expect(patch.leadUid).toBe(activeLeads[0].uid);
    // No member other than the single lead carries the 'lead' role.
    expect(
      Object.values(members).filter((m) => m.role === 'lead')
    ).toHaveLength(1);
  });

  it('demotes extra active leads to coLead (keeps exactly one lead)', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Two Leads',
          leadUid: 'lead-uid',
          members: {
            'lead-uid': {
              uid: 'lead-uid',
              email: 'lead@school.org',
              displayName: 'Lead',
              role: 'lead',
              status: 'active',
              joinedAt: 1000,
            },
            'other-uid': {
              uid: 'other-uid',
              email: 'other@school.org',
              displayName: 'Other',
              role: 'lead',
              status: 'active',
              joinedAt: 2000,
            },
          },
          memberUids: ['lead-uid', 'other-uid'],
          memberEmails: {
            'lead-uid': 'lead@school.org',
            'other-uid': 'other@school.org',
          },
        },
      },
    ];
    const patch = (await run(state), setFor(state, 'plc-1')!.patch);
    const members = patch.members as Record<string, Record<string, unknown>>;
    expect(members['lead-uid'].role).toBe('lead');
    expect(members['other-uid'].role).toBe('coLead');
    // Preserves existing joinedAt rather than re-stamping.
    expect(members['lead-uid'].joinedAt).toBe(1000);
  });

  it('skips a PLC with no members at all (unrecoverable shape)', async () => {
    state.plcs = [{ id: 'plc-empty', data: { name: 'Empty' } }];
    const res = await run(state);
    expect(res.skippedEmpty).toBe(1);
    expect(res.migrated).toBe(0);
    expect(setFor(state, 'plc-empty')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// orgId inference
// ---------------------------------------------------------------------------

describe('runMigratePlcs - orgId inference', () => {
  it('infers orgId from the first member domain that resolves', async () => {
    resolveOrgIdForDomain.mockImplementation((_db, domain) =>
      Promise.resolve(domain === '@school.org' ? 'org-123' : null)
    );
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Team',
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@school.org' },
        },
      },
    ];
    const res = await run(state);
    expect(res.orgIdInferred).toBe(1);
    expect(setFor(state, 'plc-1')!.patch.orgId).toBe('org-123');
  });

  it('sets orgId to null when no member domain resolves', async () => {
    resolveOrgIdForDomain.mockResolvedValue(null);
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Team',
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@nowhere.test' },
        },
      },
    ];
    const res = await run(state);
    expect(res.orgIdInferred).toBe(0);
    expect(setFor(state, 'plc-1')!.patch.orgId).toBeNull();
  });

  it('never overwrites a manually-set orgId (and does not query domains)', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Team',
          orgId: 'manual-org',
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@school.org' },
        },
      },
    ];
    await run(state);
    const patch = setFor(state, 'plc-1')!.patch;
    // orgId not present in the patch → merge-set leaves the manual value.
    expect('orgId' in patch).toBe(false);
    expect(resolveOrgIdForDomain).not.toHaveBeenCalled();
  });

  it('treats explicit null orgId as un-set and infers', async () => {
    resolveOrgIdForDomain.mockResolvedValue('org-x');
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Team',
          orgId: null,
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@school.org' },
        },
      },
    ];
    await run(state);
    expect(setFor(state, 'plc-1')!.patch.orgId).toBe('org-x');
  });
});

// ---------------------------------------------------------------------------
// aggregates skeleton
// ---------------------------------------------------------------------------

describe('runMigratePlcs - aggregates skeleton', () => {
  it('seeds the aggregates marker when contributions exist', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        contributions: 3,
        data: {
          name: 'Team',
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@school.org' },
        },
      },
    ];
    const res = await run(state);
    expect(res.aggregatesSeeded).toBe(1);
    const aggSet = state.sets.find(
      (s) => s.path === 'plcs/plc-1/aggregates/_migration'
    );
    expect(aggSet).toBeDefined();
    expect(aggSet!.patch.placeholder).toBe(true);
    expect(aggSet!.patch.ranAt).toBe(SERVER_TS);
  });

  it('does not seed aggregates when there are no contributions', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        contributions: 0,
        data: {
          name: 'Team',
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@school.org' },
        },
      },
    ];
    const res = await run(state);
    expect(res.aggregatesSeeded).toBe(0);
    expect(
      state.sets.find((s) => s.path.endsWith('/aggregates/_migration'))
    ).toBeUndefined();
  });

  it('does not re-seed aggregates when the marker already exists', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        contributions: 5,
        aggregatesMarker: true,
        data: {
          name: 'Team',
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@school.org' },
        },
      },
    ];
    const res = await run(state);
    expect(res.aggregatesSeeded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// idempotency
// ---------------------------------------------------------------------------

describe('runMigratePlcs - idempotency', () => {
  it('no-ops a doc that is already migrated (marker + well-formed map)', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Migrated',
          membersMigratedAt: 123456,
          members: {
            'lead-uid': {
              uid: 'lead-uid',
              email: 'lead@school.org',
              displayName: 'Lead',
              role: 'lead',
              status: 'active',
              joinedAt: 1000,
            },
          },
          leadUid: 'lead-uid',
          memberUids: ['lead-uid'],
          memberEmails: { 'lead-uid': 'lead@school.org' },
        },
      },
    ];
    const res = await run(state);
    expect(res.alreadyMigrated).toBe(1);
    expect(res.migrated).toBe(0);
    expect(setFor(state, 'plc-1')).toBeUndefined();
    // No org query for an already-migrated doc.
    expect(resolveOrgIdForDomain).not.toHaveBeenCalled();
  });

  it('re-migrates if the marker is present but the map is malformed', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Half',
          membersMigratedAt: 1,
          // Empty map → treated as un-migrated (matches T1 semantics).
          members: {},
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@school.org' },
        },
      },
    ];
    const res = await run(state);
    expect(res.migrated).toBe(1);
    expect(res.alreadyMigrated).toBe(0);
  });

  it('a second full run produces zero writes (stable convergence)', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Team',
          leadUid: 'lead-uid',
          memberUids: ['lead-uid', 'member-uid'],
          memberEmails: {
            'lead-uid': 'lead@school.org',
            'member-uid': 'member@school.org',
          },
        },
      },
    ];
    // First run: build the patch and fold it back into the fixture data so a
    // second run sees the migrated on-disk shape.
    await run(state);
    const patch = setFor(state, 'plc-1')!.patch;
    state.plcs[0].data = { ...state.plcs[0].data, ...patch };
    // Resolve serverTimestamp sentinels to concrete values like Firestore
    // would, so the well-formed check sees a real joinedAt.
    const members = state.plcs[0].data.members as Record<
      string,
      Record<string, unknown>
    >;
    for (const m of Object.values(members)) {
      if (m.joinedAt === SERVER_TS) m.joinedAt = 1700000000000;
    }
    state.plcs[0].data.membersMigratedAt = 1700000000000;

    // Second run from a clean capture.
    const state2: StubState = {
      plcs: state.plcs,
      users: state.users,
      sets: [],
      commits: 0,
    };
    const res2 = await run(state2);
    expect(res2.alreadyMigrated).toBe(1);
    expect(res2.migrated).toBe(0);
    expect(state2.sets).toHaveLength(0);
  });

  it('re-deriving a migrated doc yields a byte-identical members map (no role flips / no re-stamp / no orgId clobber)', async () => {
    // Org resolves so the first run infers a concrete orgId we can later prove
    // is preserved rather than re-inferred/clobbered.
    resolveOrgIdForDomain.mockImplementation((_db, domain) =>
      Promise.resolve(domain === '@school.org' ? 'org-abc' : null)
    );
    state.users = { 'lead-uid': { displayName: 'Ada Lead' } };
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'Team',
          leadUid: 'lead-uid',
          memberUids: ['lead-uid', 'member-uid'],
          memberEmails: {
            'lead-uid': 'Lead@School.org',
            'member-uid': 'member@school.org',
          },
        },
      },
    ];

    // First run produces the canonical patch.
    await run(state);
    const firstPatch = setFor(state, 'plc-1')!.patch;
    expect(firstPatch.orgId).toBe('org-abc');

    // Fold the patch back onto the doc and resolve the serverTimestamp
    // sentinels to concrete millis, exactly as Firestore would persist them.
    state.plcs[0].data = { ...state.plcs[0].data, ...firstPatch };
    const persistedMembers = state.plcs[0].data.members as Record<
      string,
      Record<string, unknown>
    >;
    for (const m of Object.values(persistedMembers)) {
      if (m.joinedAt === SERVER_TS) m.joinedAt = 1700000000000;
    }

    // STRIP the idempotency marker so the second pass is forced to fully
    // re-plan the doc (well-formed-map alone is not enough without the marker).
    // This proves convergence of the synthesis itself, not just the guard.
    delete state.plcs[0].data.membersMigratedAt;

    const state2: StubState = {
      plcs: state.plcs,
      users: state.users,
      sets: [],
      commits: 0,
    };
    const res2 = await run(state2);
    // Re-planned (no marker) → it writes again, but the content is stable.
    expect(res2.migrated).toBe(1);

    const secondPatch = setFor(state2, 'plc-1')!.patch;
    const secondMembers = secondPatch.members as Record<
      string,
      Record<string, unknown>
    >;

    // No duplicate / dropped entries.
    expect(Object.keys(secondMembers).sort()).toEqual(
      Object.keys(persistedMembers).sort()
    );
    // Roles unchanged (no flips) and joinedAt preserved (no re-stamp): the
    // second-run members map is byte-identical to the persisted one.
    expect(secondMembers).toEqual(persistedMembers);
    expect(secondMembers['lead-uid'].role).toBe('lead');
    expect(secondMembers['lead-uid'].joinedAt).toBe(1700000000000);
    expect(secondMembers['member-uid'].role).toBe('member');
    // Mirrors stay consistent.
    expect(secondPatch.leadUid).toBe('lead-uid');
    expect((secondPatch.memberUids as string[]).sort()).toEqual([
      'lead-uid',
      'member-uid',
    ]);
    // orgId already set on the doc → never re-queried, never clobbered.
    expect('orgId' in secondPatch).toBe(false);
    expect(resolveOrgIdForDomain).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// batching
// ---------------------------------------------------------------------------

describe('runMigratePlcs - batching', () => {
  it('commits once for a small migration and reports scanned count', async () => {
    state.plcs = [
      {
        id: 'plc-1',
        data: {
          name: 'A',
          leadUid: 'a',
          memberUids: ['a'],
          memberEmails: { a: 'a@school.org' },
        },
      },
      {
        id: 'plc-2',
        data: {
          name: 'B',
          leadUid: 'b',
          memberUids: ['b'],
          memberEmails: { b: 'b@school.org' },
        },
      },
    ];
    const res = await run(state);
    expect(res.scanned).toBe(2);
    expect(res.migrated).toBe(2);
    expect(state.commits).toBe(1);
  });
});
