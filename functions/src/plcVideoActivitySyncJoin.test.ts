// Cloud Function unit tests for `handleJoinPlcVideoActivitySyncGroup`
// (Phase 4). Mirrors `plcQuizSyncJoin.test.ts` exactly except the
// expected synced collection is `synced_video_activities` and the
// per-PLC subcollection is `video_activities` rather than `quizzes`.
//
// The membership gate is the security-critical invariant — anyone who
// knows a plcVideoActivityId could otherwise sneak into the participants
// map of the canonical synced group and start publishing edits.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
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
  markers?: Record<string, Record<string, unknown>>;
  deletes?: string[];
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
    if (ref.__path.includes('/plcDetached/')) {
      const marker = state.markers?.[ref.__path.split('/').pop() ?? ''];
      return Promise.resolve({ exists: !!marker, data: () => marker });
    }
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
        delete: (ref: { __path: string }) => void;
      }) => Promise<T>
    ): Promise<T> => {
      return fn({
        get,
        update: (ref, patch) => {
          state.updates.push({ path: ref.__path, patch });
        },
        delete: (ref) => {
          (state.deletes ??= []).push(ref.__path);
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
    entry: { syncGroupId: SYNC_GROUP_ID, sharedBy: 'member-b' },
    group: { version: 3, participants: { 'member-b': { joinedAt: 1000 } } },
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
    state.group = {
      plcId: PLC_ID,
      participants: { 'member-b': { joinedAt: 1000 } },
    }; // no version field
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

describe('handleJoinPlcVideoActivitySyncGroup - editor and group-link gates', () => {
  it('rejects a viewer (permission-denied) without writing', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'member-b'],
      members: { [MEMBER_UID]: { role: 'viewer', status: 'active' } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('rejects a removed member no longer in memberUids (permission-denied)', async () => {
    state.plc = {
      memberUids: ['member-b'],
      members: { [MEMBER_UID]: { role: 'member', status: 'removed' } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('allows a rejoined member whose entry still says removed', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'member-b'],
      members: { [MEMBER_UID]: { role: 'member', status: 'removed' } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).resolves.toMatchObject({ alreadyJoined: false });
  });

  it('allows a non-viewer keyed member', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'member-b'],
      members: { [MEMBER_UID]: { role: 'member', status: 'active' } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).resolves.toMatchObject({
      alreadyJoined: false,
    });
  });

  it('rejects a header naming a group its sharer is not in (permission-denied)', async () => {
    state.entry = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = {
      version: 3,
      plcId: 'victim-plc',
      participants: { 'victim-uid': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('rejects a header with no sharedBy on a group not created for this PLC', async () => {
    state.entry = { syncGroupId: SYNC_GROUP_ID };
    state.group = { version: 3, participants: {} };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('allows a group created for this PLC when the sharer left but a member remains', async () => {
    state.entry = { syncGroupId: SYNC_GROUP_ID, sharedBy: 'gone-uid' };
    state.group = {
      version: 3,
      plcId: PLC_ID,
      participants: { 'member-b': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).resolves.toMatchObject({
      alreadyJoined: false,
    });
  });

  it('rejects a recreated PLC id whose members are not in the group', async () => {
    state.plc = { memberUids: [MEMBER_UID] };
    state.entry = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = {
      version: 3,
      plcId: PLC_ID,
      participants: { 'victim-uid': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('ignores memberUids a lead added without a members entry', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'victim-uid'],
      members: { [MEMBER_UID]: { role: 'lead', status: 'active' } },
    };
    state.entry = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = {
      version: 3,
      plcId: PLC_ID,
      participants: { 'victim-uid': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db, MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });
});

describe('handleJoinPlcVideoActivitySyncGroup - re-join and undo', () => {
  const db = () =>
    makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcVideoActivitySyncGroup
    >[0];

  it('lets an already-participating viewer re-join as a no-op', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'member-b'],
      members: { [MEMBER_UID]: { role: 'viewer', status: 'active' } },
    };
    state.group = {
      version: 4,
      participants: { [MEMBER_UID]: { joinedAt: 1000 } },
    };
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db(), MEMBER_UID, PLC_ID, ENTRY_ID)
    ).resolves.toMatchObject({ alreadyJoined: true, version: 4 });
    expect(state.updates).toHaveLength(0);
  });

  it('still rejects an already-participating non-member', async () => {
    state.group = {
      version: 4,
      participants: { [NON_MEMBER_UID]: { joinedAt: 1000 } },
    };
    await expect(
      handleJoinPlcVideoActivitySyncGroup(
        db(),
        NON_MEMBER_UID,
        PLC_ID,
        ENTRY_ID
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('lets the sharer re-join after detaching from their own sole-participant group', async () => {
    state.entry = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = { version: 3, participants: {} };
    state.markers = {
      [MEMBER_UID]: { plcId: PLC_ID, plcContentId: ENTRY_ID, detachedAt: 1 },
    };
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db(), MEMBER_UID, PLC_ID, ENTRY_ID)
    ).resolves.toMatchObject({ alreadyJoined: false });
    expect(state.updates).toHaveLength(1);
    expect(state.deletes).toEqual([
      `synced_video_activities/${SYNC_GROUP_ID}/plcDetached/${MEMBER_UID}`,
    ]);
  });

  it('ignores a detach marker left through a different header', async () => {
    state.entry = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = { version: 3, participants: {} };
    state.markers = {
      [MEMBER_UID]: { plcId: PLC_ID, plcContentId: 'other', detachedAt: 1 },
    };
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db(), MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('does not let a viewer use a detach marker', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'member-b'],
      members: { [MEMBER_UID]: { role: 'viewer', status: 'active' } },
    };
    state.group = { version: 3, participants: {} };
    state.markers = {
      [MEMBER_UID]: { plcId: PLC_ID, plcContentId: ENTRY_ID, detachedAt: 1 },
    };
    await expect(
      handleJoinPlcVideoActivitySyncGroup(db(), MEMBER_UID, PLC_ID, ENTRY_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });
});
