// Cloud Function unit tests for `handleJoinPlcAssignmentSyncGroup` (Phase 3).
// Mirrors the gap from Phase 2's `plcQuizSyncJoin.ts` (which had no test
// either) and pins the security-critical Admin-SDK membership check —
// the rule that prevents a non-PLC-member from sneaking into a synced
// group's `participants` map by knowing the template id alone.
//
// We exercise `handleJoinPlcAssignmentSyncGroup` with a stub Firestore
// rather than mocking the `onCall` wrapper. The wrapper's auth /
// argument validation is trivial; the transaction body is where the
// invariants live.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin so the module-level `admin.initializeApp()` no-ops
// and we have a stable `HttpsError` constructor to assert against.
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
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

import { handleJoinPlcAssignmentSyncGroup } from './plcAssignmentSyncJoin';

// ---------------------------------------------------------------------------
// Stub Firestore — minimal surface for the transaction handler.
// ---------------------------------------------------------------------------

interface DocSnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface StubState {
  plc: Record<string, unknown> | null;
  template: Record<string, unknown> | null;
  group: Record<string, unknown> | null;
  /** Captured tx.update() calls — `[ref, patch]` per call. */
  updates: Array<{ path: string; patch: Record<string, unknown> }>;
}

function makeDb(state: StubState) {
  const docRef = (path: string) => ({
    __path: path,
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
  });

  const get = (ref: { __path: string }): Promise<DocSnap> => {
    if (
      ref.__path.startsWith('plcs/') &&
      !ref.__path.includes('/assignments/')
    ) {
      return Promise.resolve({
        exists: state.plc !== null,
        data: () => state.plc ?? undefined,
      });
    }
    if (ref.__path.includes('/assignments/')) {
      return Promise.resolve({
        exists: state.template !== null,
        data: () => state.template ?? undefined,
      });
    }
    if (ref.__path.startsWith('synced_quizzes/')) {
      return Promise.resolve({
        exists: state.group !== null,
        data: () => state.group ?? undefined,
      });
    }
    throw new Error(`Unexpected ref: ${ref.__path}`);
  };

  return {
    collection: (name: string) => collectionRef(name),
    runTransaction: async <T>(
      fn: (tx: {
        get: (ref: { __path: string }) => Promise<DocSnap>;
        update: (
          ref: { __path: string },
          patch: Record<string, unknown>
        ) => void;
      }) => Promise<T>
    ): Promise<T> => {
      return fn({
        get,
        update: (ref, patch) => {
          state.updates.push({ path: ref.__path, patch });
        },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const PLC_ID = 'plc-rules-test';
const TEMPLATE_ID = 'tmpl-1';
const SYNC_GROUP_ID = 'sync-group-1';
const MEMBER_UID = 'member-a';
const NON_MEMBER_UID = 'random-uid';

let state: StubState;

beforeEach(() => {
  state = {
    plc: { memberUids: [MEMBER_UID, 'member-b'] },
    template: { syncGroupId: SYNC_GROUP_ID },
    group: { version: 3, participants: {} },
    updates: [],
  };
});

describe('handleJoinPlcAssignmentSyncGroup - membership gate', () => {
  it('rejects callers who are not in memberUids (permission-denied)', async () => {
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    await expect(
      handleJoinPlcAssignmentSyncGroup(db, NON_MEMBER_UID, PLC_ID, TEMPLATE_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    // Critical invariant: a rejected caller must NOT have caused any
    // participant writes. If this ever flips the security model has
    // collapsed — anyone knowing a template id could join the sync
    // group and start publishing edits.
    expect(state.updates).toHaveLength(0);
  });

  it('rejects when the PLC doc does not exist (not-found)', async () => {
    state.plc = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    await expect(
      handleJoinPlcAssignmentSyncGroup(db, MEMBER_UID, PLC_ID, TEMPLATE_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when memberUids is missing or non-array (treated as empty)', async () => {
    state.plc = {}; // no memberUids field
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    await expect(
      handleJoinPlcAssignmentSyncGroup(db, MEMBER_UID, PLC_ID, TEMPLATE_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('handleJoinPlcAssignmentSyncGroup - data shape gates', () => {
  it('rejects when the template doc is missing (not-found)', async () => {
    state.template = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    await expect(
      handleJoinPlcAssignmentSyncGroup(db, MEMBER_UID, PLC_ID, TEMPLATE_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when syncGroupId is missing (failed-precondition)', async () => {
    state.template = {}; // exists but no syncGroupId
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    await expect(
      handleJoinPlcAssignmentSyncGroup(db, MEMBER_UID, PLC_ID, TEMPLATE_ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects an empty-string syncGroupId (failed-precondition)', async () => {
    state.template = { syncGroupId: '' };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    await expect(
      handleJoinPlcAssignmentSyncGroup(db, MEMBER_UID, PLC_ID, TEMPLATE_ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when the synced group doc does not exist (not-found)', async () => {
    state.group = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    await expect(
      handleJoinPlcAssignmentSyncGroup(db, MEMBER_UID, PLC_ID, TEMPLATE_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('handleJoinPlcAssignmentSyncGroup - join semantics', () => {
  it('writes a participants entry on first join and returns alreadyJoined: false', async () => {
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    const result = await handleJoinPlcAssignmentSyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      TEMPLATE_ID
    );
    expect(result).toMatchObject({
      groupId: SYNC_GROUP_ID,
      version: 3,
      alreadyJoined: false,
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].path).toBe(`synced_quizzes/${SYNC_GROUP_ID}`);
    const patch = state.updates[0].patch as {
      participants: Record<string, { joinedAt: number }>;
      updatedAt: number;
    };
    expect(patch.participants[MEMBER_UID]).toBeDefined();
    expect(typeof patch.participants[MEMBER_UID].joinedAt).toBe('number');
    expect(typeof patch.updatedAt).toBe('number');
  });

  it('preserves existing participants when a new member joins', async () => {
    state.group = {
      version: 3,
      participants: { 'member-b': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    await handleJoinPlcAssignmentSyncGroup(db, MEMBER_UID, PLC_ID, TEMPLATE_ID);
    const patch = state.updates[0].patch as {
      participants: Record<string, { joinedAt: number }>;
    };
    // Both the prior member and the joining member must be present.
    // Without the spread copy of `groupData.participants`, a
    // re-implementation that overwrites the map would silently kick
    // earlier joiners out of the sync group on every new join.
    expect(Object.keys(patch.participants).sort()).toEqual([
      MEMBER_UID,
      'member-b',
    ]);
    expect(patch.participants['member-b'].joinedAt).toBe(1000);
  });

  it('is idempotent on re-join: returns alreadyJoined: true without writing', async () => {
    state.group = {
      version: 5,
      participants: { [MEMBER_UID]: { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    const result = await handleJoinPlcAssignmentSyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      TEMPLATE_ID
    );
    expect(result).toEqual({
      groupId: SYNC_GROUP_ID,
      version: 5,
      alreadyJoined: true,
    });
    // No update — re-joining must NOT bump version or rewrite the
    // participants map. A version bump from a no-op join would race
    // against the owning client's strictly-monotonic update rule.
    expect(state.updates).toHaveLength(0);
  });

  it('defaults version to 1 when the synced group doc lacks one', async () => {
    state.group = { participants: {} }; // no version field
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcAssignmentSyncGroup
    >[0];
    const result = await handleJoinPlcAssignmentSyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      TEMPLATE_ID
    );
    expect(result.version).toBe(1);
  });
});
