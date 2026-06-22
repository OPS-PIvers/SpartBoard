import { describe, it, expect, vi } from 'vitest';

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

import { buildPlcIndexMirror } from './mirrorPlcIndex';

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
