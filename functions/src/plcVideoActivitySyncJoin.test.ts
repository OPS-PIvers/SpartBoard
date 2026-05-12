// Cloud Function unit tests for `handleJoinPlcVideoActivitySyncGroup`
// (Phase 4). Mirrors `plcQuizSyncJoin.test.ts` exactly except the
// expected synced collection is `synced_video_activities` and the
// per-PLC subcollection is `video_activities` rather than `quizzes`.
//
// The membership gate is the security-critical invariant — anyone who
// knows a plcVideoActivityId could otherwise sneak into the participants
// map of the canonical synced group and start publishing edits.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { handleJoinPlcVideoActivitySyncGroup } from './plcVideoActivitySyncJoin';

// ---------------------------------------------------------------------------
// Stub Firestore — minimal surface for the transaction handler.
// ---------------------------------------------------------------------------

interface DocSnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface StubState {
  plc: Record<string, unknown> | null;
  entry: Record<string, unknown> | null;
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
      !ref.__path.includes('/video_activities/')
    ) {
      return Promise.resolve({
        exists: state.plc !== null,
        data: () => state.plc ?? undefined,
      });
    }
    if (ref.__path.includes('/video_activities/')) {
      return Promise.resolve({
        exists: state.entry !== null,
        data: () => state.entry ?? undefined,
      });
    }
    if (ref.__path.startsWith('synced_video_activities/')) {
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
const ENTRY_ID = 'pva-1';
const SYNC_GROUP_ID = 'sync-group-1';
const MEMBER_UID = 'member-a';
const NON_MEMBER_UID = 'random-uid';

let state: StubState;

beforeEach(() => {
  state = {
    plc: { memberUids: [MEMBER_UID, 'member-b'] },
    entry: { syncGroupId: SYNC_GROUP_ID },
    group: { version: 3, participants: {} },
    updates: [],
  };
});

describe('handleJoinPlcVideoActivitySyncGroup - membership gate', () => {
  it('rejects callers who are not in memberUids (permission-denied)', async () => {
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, NON_MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    // Critical invariant: a rejected caller must NOT have caused any
    // participant writes. If this ever flips the security model has
    // collapsed.
    expect(state.updates).toHaveLength(0);
  });

  it('rejects when the PLC doc does not exist (not-found)', async () => {
    state.plc = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when memberUids is missing or non-array (treated as empty)', async () => {
    state.plc = {}; // no memberUids field
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('handleJoinPlcVideoActivitySyncGroup - data shape gates', () => {
  it('rejects when the PLC video activity entry is missing (not-found)', async () => {
    state.entry = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when syncGroupId is missing (failed-precondition)', async () => {
    state.entry = {}; // exists but no syncGroupId
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects an empty-string syncGroupId (failed-precondition)', async () => {
    state.entry = { syncGroupId: '' };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when the synced group doc does not exist (not-found)', async () => {
    state.group = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('handleJoinPlcVideoActivitySyncGroup - join semantics', () => {
  it('writes a participants entry on first join and returns alreadyJoined: false', async () => {
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    const result = await handleJoinPlcVideoActivitySyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      ENTRY_ID
    );
    expect(result).toMatchObject({
      groupId: SYNC_GROUP_ID,
      version: 3,
      alreadyJoined: false,
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].path).toBe(
      `synced_video_activities/${SYNC_GROUP_ID}`
    );
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
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID);
    const patch = state.updates[0].patch as {
      participants: Record<string, { joinedAt: number }>;
    };
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
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    const result = await handleJoinPlcVideoActivitySyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      ENTRY_ID
    );
    expect(result).toEqual({
      groupId: SYNC_GROUP_ID,
      version: 5,
      alreadyJoined: true,
    });
    expect(state.updates).toHaveLength(0);
  });

  it('defaults version to 1 when the synced group doc lacks one', async () => {
    state.group = { participants: {} }; // no version field
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    const result = await handleJoinPlcVideoActivitySyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      ENTRY_ID
    );
    expect(result.version).toBe(1);
  });
});
