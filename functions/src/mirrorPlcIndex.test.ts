import { describe, it, expect, vi, beforeEach } from 'vitest';

// mirrorPlcIndex.ts has four module-level side effects that must be mocked
// before the import so Vitest's transform can resolve them:
//
//   1. `import { onDocumentWritten } from 'firebase-functions/v2/firestore'`
//      — not installed in the test node_modules; must be intercepted.
//   2. `import * as logger from 'firebase-functions/logger'`
//      — likewise absent; replace with no-op stubs.
//   3. `import * as admin from './firebaseAdmin'`
//      — guard `admin.apps.length` so the initializeApp() in functionsInit
//        no-ops instead of attempting a real connection.
//   4. `import './functionsInit'`
//      — functionsInit calls `setGlobalOptions` (firebase-functions/v2) and
//        `admin.initializeApp()`. Both are mocked via (1) and (3) above, but
//        the `setGlobalOptions` import also needs a firebase-functions/v2 stub.
//
// This mirrors the approach used by `gcPlcOrphans.test.ts` and
// `detachPlcSyncLinkage.test.ts`, which test sibling modules with the same
// module-level bootstrap pattern.

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) },
  }),
}));

// `functionsInit` calls `setGlobalOptions` at import time.
vi.mock('firebase-functions/v2', () => ({
  setGlobalOptions: vi.fn(),
}));

// The trigger factory — returns the handler directly so the module can be
// imported without registering a real Firestore trigger.
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_opts: unknown, handler: unknown) => handler),
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import * as admin from './firebaseAdmin';
import {
  buildPlcIndexMirror,
  discoveryOrgId,
  mirrorPlcIndex,
} from './mirrorPlcIndex';

describe('buildPlcIndexMirror — slim, PII-free discovery mirror', () => {
  it('projects name / orgId / buildingId / memberUids + count (NO member PII)', () => {
    const mirror = buildPlcIndexMirror({
      name: 'Org-Stamped PLC',
      orgId: 'org-1',
      buildingId: 'bldg-oms',
      leadUid: 'u1',
      memberUids: ['u1', 'u2'],
      memberEmails: { u1: 'a@x.org', u2: 'b@x.org' },
      members: {
        u1: { uid: 'u1', email: 'a@x.org', displayName: 'A', role: 'lead' },
        u2: { uid: 'u2', email: 'b@x.org', displayName: 'B', role: 'member' },
      },
    });
    expect(mirror).toEqual({
      name: 'Org-Stamped PLC',
      orgId: 'org-1',
      buildingId: 'bldg-oms',
      memberUids: ['u1', 'u2'],
      memberCount: 2,
    });
    // Explicit: the mirror must never carry email / displayName / members map.
    const asRecord = mirror as unknown as Record<string, unknown>;
    expect(asRecord).not.toHaveProperty('memberEmails');
    expect(asRecord).not.toHaveProperty('members');
  });

  it('null orgId/buildingId when absent (legacy / un-tenanted PLC)', () => {
    const mirror = buildPlcIndexMirror({
      name: 'Legacy PLC',
      memberUids: ['u1'],
    });
    expect(mirror).toEqual({
      name: 'Legacy PLC',
      orgId: null,
      buildingId: null,
      memberUids: ['u1'],
      memberCount: 1,
    });
  });

  it('falls back to active members-map entries when memberUids is absent', () => {
    const mirror = buildPlcIndexMirror({
      name: 'Map-Only PLC',
      orgId: 'org-1',
      members: {
        u1: { uid: 'u1', role: 'lead', status: 'active' },
        u2: { uid: 'u2', role: 'member', status: 'removed' },
        u3: { uid: 'u3', role: 'member', status: 'active' },
      },
    });
    expect(mirror?.memberUids.sort()).toEqual(['u1', 'u3']);
    expect(mirror?.memberCount).toBe(2);
  });

  it('returns null for an unusable root (no name) so no index entry is written', () => {
    expect(
      buildPlcIndexMirror({ orgId: 'org-1', memberUids: ['u1'] })
    ).toBeNull();
  });

  it('ignores non-string uids in memberUids', () => {
    const mirror = buildPlcIndexMirror({
      name: 'PLC',
      memberUids: ['u1', 42, null, 'u2'],
    });
    expect(mirror?.memberUids).toEqual(['u1', 'u2']);
    expect(mirror?.memberCount).toBe(2);
  });
});

describe('discoveryOrgId — anti-forgery gate on the discovery mirror', () => {
  it('carries the orgId when the lead is a verified member of that org', () => {
    expect(discoveryOrgId('orono', true)).toBe('orono');
  });

  it('drops a forged orgId to null when the lead is NOT a member of that org', () => {
    // A raw write set orgId:'orono' but the lead has no orono membership doc —
    // the PLC must not surface in orono's discovery directory.
    expect(discoveryOrgId('orono', false)).toBeNull();
  });

  it('returns null for an un-tenanted PLC (no claimed orgId)', () => {
    expect(discoveryOrgId(null, false)).toBeNull();
    expect(discoveryOrgId(null, true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mirrorPlcIndex handler: the org guard reads the lead's email from Firebase
// Auth, never from the client-written members map, and needs a staff doc.
// ---------------------------------------------------------------------------

interface HandlerOpts {
  memberDocs: Record<string, Record<string, unknown>>;
  captured: { path: string; data: Record<string, unknown> }[];
  queriedPaths: string[];
  index?: Record<string, unknown>;
}

function makeHandlerDb(opts: HandlerOpts) {
  const docRef = (path: string) => ({
    get: () => {
      opts.queriedPaths.push(path);
      const data = path.startsWith('plcIndex/')
        ? opts.index
        : opts.memberDocs[path];
      return Promise.resolve({ exists: data !== undefined, data: () => data });
    },
    set: (data: Record<string, unknown>) => {
      opts.captured.push({ path, data });
      return Promise.resolve();
    },
    delete: () => Promise.resolve(),
  });
  return {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
    }),
    doc: (path: string) => docRef(path),
  } as unknown as admin.firestore.Firestore;
}

function makeEvent(
  plcId: string,
  afterData: Record<string, unknown> | null,
  beforeExists = false
): Parameters<typeof mirrorPlcIndex>[0] {
  return {
    params: { plcId },
    data: {
      before: { exists: beforeExists, data: () => undefined },
      after: {
        exists: afterData !== null,
        data: () => afterData ?? undefined,
        createTime: { toMillis: () => 77 },
      },
    },
  } as unknown as Parameters<typeof mirrorPlcIndex>[0];
}

const LEAD_EMAIL = 'lead@orono.k12.mn.us';
const STAFF_DOC = `organizations/orono/members/${LEAD_EMAIL}`;

function mockAuthUser(
  user: { email?: string; emailVerified?: boolean } | null
): void {
  vi.mocked(admin.auth).mockReturnValue({
    getUser: () =>
      user
        ? Promise.resolve(user)
        : Promise.reject(
            Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
          ),
  } as unknown as ReturnType<typeof admin.auth>);
}

const forgedRoot = {
  name: 'Forged PLC',
  orgId: 'orono',
  leadUid: 'u1',
  memberUids: ['u1'],
  memberEmails: { u1: LEAD_EMAIL },
  members: {
    u1: { uid: 'u1', email: LEAD_EMAIL, role: 'lead', status: 'active' },
  },
};

describe('mirrorPlcIndex handler — org guard', () => {
  let opts: HandlerOpts;

  beforeEach(() => {
    opts = {
      memberDocs: { [STAFF_DOC]: { roleId: 'teacher', status: 'active' } },
      captured: [],
      queriedPaths: [],
    };
    vi.mocked(admin.firestore).mockReturnValue(makeHandlerDb(opts));
    mockAuthUser({ email: 'Lead@Orono.k12.mn.us', emailVerified: true });
  });

  it('keeps orgId when the lead Auth email holds a staff doc', async () => {
    await mirrorPlcIndex(makeEvent('plc-1', forgedRoot, true));
    expect(opts.captured).toHaveLength(1);
    expect(opts.captured[0].data.orgId).toBe('orono');
    expect(opts.queriedPaths).toContain(STAFF_DOC);
  });

  it('drops orgId when the lead is anonymous even though the root names a real member', async () => {
    mockAuthUser({ emailVerified: false });
    await mirrorPlcIndex(makeEvent('plc-1', forgedRoot, true));
    expect(opts.captured[0].data.orgId).toBeNull();
    expect(opts.queriedPaths).not.toContain(STAFF_DOC);
  });

  it('drops orgId when the lead Auth email differs from the root', async () => {
    mockAuthUser({ email: 'attacker@gmail.com', emailVerified: true });
    await mirrorPlcIndex(makeEvent('plc-1', forgedRoot, true));
    expect(opts.captured[0].data.orgId).toBeNull();
    expect(opts.queriedPaths).toContain(
      'organizations/orono/members/attacker@gmail.com'
    );
  });

  it('drops orgId for an unverified Auth email or a missing account', async () => {
    mockAuthUser({ email: LEAD_EMAIL, emailVerified: false });
    await mirrorPlcIndex(makeEvent('plc-1', forgedRoot, true));
    mockAuthUser(null);
    await mirrorPlcIndex(makeEvent('plc-1', forgedRoot, true));
    expect(opts.captured.map((c) => c.data.orgId)).toEqual([null, null]);
  });

  it('drops orgId when the lead member doc is a student or inactive', async () => {
    for (const doc of [
      { roleId: 'student', status: 'active' },
      { roleId: 'teacher', status: 'inactive' },
    ]) {
      opts.memberDocs[STAFF_DOC] = doc;
      await mirrorPlcIndex(makeEvent('plc-1', forgedRoot, true));
    }
    expect(opts.captured.map((c) => c.data.orgId)).toEqual([null, null]);
  });

  it('fails the run on a transient Auth error instead of dropping orgId', async () => {
    vi.mocked(admin.auth).mockReturnValue({
      getUser: () => Promise.reject(new Error('unavailable')),
    } as unknown as ReturnType<typeof admin.auth>);
    await expect(
      mirrorPlcIndex(makeEvent('plc-1', forgedRoot, true))
    ).rejects.toThrow('unavailable');
    expect(opts.captured).toHaveLength(0);
  });

  it('records the creator in plcCreators on create, bound to the root', async () => {
    await mirrorPlcIndex(makeEvent('plc-1', forgedRoot));
    expect(opts.captured[0]).toEqual({
      path: 'plcCreators/plc-1',
      data: { creatorUid: 'u1', rootCreateMs: 77 },
    });
  });

  it('never records a creator from an update', async () => {
    await mirrorPlcIndex(makeEvent('plc-1', forgedRoot, true));
    expect(opts.captured.map((c) => c.path)).toEqual(['plcIndex/plc-1']);
    expect(opts.captured[0].data).not.toHaveProperty('creatorUid');
  });

  it('records the creator even for a root with no name', async () => {
    await mirrorPlcIndex(makeEvent('plc-1', { leadUid: 'u1' }));
    expect(opts.captured.map((c) => c.path)).toEqual(['plcCreators/plc-1']);
  });
});
