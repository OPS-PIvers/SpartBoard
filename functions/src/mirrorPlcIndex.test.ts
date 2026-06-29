import { describe, it, expect, vi, beforeEach } from 'vitest';

// mirrorPlcIndex.ts has four module-level side effects that must be mocked
// before the import so Vitest's transform can resolve them:
//
//   1. `import { onDocumentWritten } from 'firebase-functions/v2/firestore'`
//      — not installed in the test node_modules; must be intercepted.
//   2. `import * as logger from 'firebase-functions/logger'`
//      — likewise absent; replace with no-op stubs.
//   3. `import * as admin from 'firebase-admin'`
//      — guard `admin.apps.length` so the initializeApp() in functionsInit
//        no-ops instead of attempting a real connection.
//   4. `import './functionsInit'`
//      — functionsInit calls `setGlobalOptions` (firebase-functions/v2) and
//        `admin.initializeApp()`. Both are mocked via (1) and (3) above, but
//        the `setGlobalOptions` import also needs a firebase-functions/v2 stub.
//
// This mirrors the approach used by `aggregatePlcAssessment.test.ts` and
// `detachPlcSyncLinkage.test.ts`, which test sibling modules with the same
// module-level bootstrap pattern.

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
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

import * as admin from 'firebase-admin';
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
// mirrorPlcIndex handler — forgery-guard lead-email resolution
//
// The forgery guard verifies that the PLC's LEAD is actually a member of the
// claimed orgId before writing it to the discovery mirror. It resolves the
// lead's email from (a) the denormalized `memberEmails` map or (b) the
// canonical `members` map. A regression where only (a) is checked causes
// post-migration PLCs — which may have `members` but no `memberEmails` — to
// have their orgId silently dropped to null in the discovery mirror, making
// them invisible to same-org peers.
// ---------------------------------------------------------------------------

/**
 * Minimal stub Firestore for the handler: captures `plcIndex/{id}.set()` calls
 * and answers `organizations/{orgId}/members/{email}.get()` queries.
 */
function makeHandlerDb(opts: {
  leadIsMember: boolean;
  captured: { path: string; data: Record<string, unknown> }[];
}) {
  const docRef = (
    path: string
  ): {
    get: () => Promise<{ exists: boolean }>;
    set: (data: Record<string, unknown>) => Promise<void>;
    delete: () => Promise<void>;
  } => ({
    get: () => Promise.resolve({ exists: opts.leadIsMember }),
    set: (data) => {
      opts.captured.push({ path, data });
      return Promise.resolve();
    },
    delete: () => Promise.resolve(),
  });

  return {
    collection: (name: string) => ({
      doc: (id: string) => {
        const base = `${name}/${id}`;
        return {
          ...docRef(base),
          collection: (sub: string) => ({
            doc: (subId: string) => docRef(`${base}/${sub}/${subId}`),
          }),
        };
      },
    }),
    doc: (path: string) => docRef(path),
  } as unknown as admin.firestore.Firestore;
}

/** Minimal Firestore event that drives the mirrorPlcIndex handler. */
function makeEvent(
  plcId: string,
  afterData: Record<string, unknown> | null
): Parameters<typeof mirrorPlcIndex>[0] {
  return {
    params: { plcId },
    data: {
      before: { exists: false, data: () => undefined },
      after: {
        exists: afterData !== null,
        data: () => afterData ?? undefined,
      },
    },
  } as unknown as Parameters<typeof mirrorPlcIndex>[0];
}

describe('mirrorPlcIndex handler — lead-email resolution for orgId forgery guard', () => {
  let captured: { path: string; data: Record<string, unknown> }[];

  beforeEach(() => {
    captured = [];
    // Wire the firebase-admin mock so admin.firestore() returns our stub.
    vi.mocked(admin.firestore).mockReturnValue(
      makeHandlerDb({ leadIsMember: true, captured }) as unknown as ReturnType<
        typeof admin.firestore
      >
    );
  });

  it('preserves orgId in the mirror when the lead email comes from memberEmails (baseline)', async () => {
    // Classic pre-migration PLC: memberEmails contains the uid→email map;
    // no canonical members map. Baseline confirms the happy path still works.
    const event = makeEvent('plc-1', {
      name: 'Math PLC',
      orgId: 'orono',
      leadUid: 'u1',
      memberUids: ['u1'],
      memberEmails: { u1: 'lead@orono.k12.mn.us' },
    });

    await mirrorPlcIndex(event);

    expect(captured).toHaveLength(1);
    expect(captured[0].data.orgId).toBe('orono');
  });

  it(
    'preserves orgId in the mirror when the lead email comes only from the ' +
      'canonical members map (memberEmails absent — regression)',
    async () => {
      // Post-migration PLC: canonical `members` map holds the lead email but
      // `memberEmails` was never populated (or was omitted on a Wave-1 create).
      // Before the fix, the handler only read `memberEmails`, found nothing,
      // and wrote orgId: null — making the PLC invisible in org discovery.
      const event = makeEvent('plc-2', {
        name: 'Science PLC',
        orgId: 'orono',
        leadUid: 'u1',
        memberUids: ['u1'],
        // No memberEmails field — only the canonical members map.
        members: {
          u1: {
            uid: 'u1',
            email: 'lead@orono.k12.mn.us',
            displayName: 'Lead Teacher',
            role: 'lead',
            status: 'active',
          },
        },
      });

      await mirrorPlcIndex(event);

      expect(captured).toHaveLength(1);
      // orgId must be preserved — the lead IS a verified org member and the
      // email came from the members map (the fallback path). Before the fix
      // this would be null, silently hiding the PLC from org peers.
      expect(captured[0].data.orgId).toBe('orono');
    }
  );

  it('still drops a forged orgId to null when the lead email resolves but the member check fails', async () => {
    // Wire a db where the lead is NOT found in the org's members collection.
    vi.mocked(admin.firestore).mockReturnValue(
      makeHandlerDb({
        leadIsMember: false,
        captured,
      }) as unknown as ReturnType<typeof admin.firestore>
    );

    const event = makeEvent('plc-3', {
      name: 'Forged PLC',
      orgId: 'wrong-org',
      leadUid: 'u1',
      memberUids: ['u1'],
      members: {
        u1: {
          uid: 'u1',
          email: 'lead@myschool.org',
          role: 'lead',
          status: 'active',
        },
      },
    });

    await mirrorPlcIndex(event);

    expect(captured).toHaveLength(1);
    // The lead's email resolved (from members map), but the org membership
    // check failed → forgery guard must still null out the orgId.
    expect(captured[0].data.orgId).toBeNull();
  });
});
