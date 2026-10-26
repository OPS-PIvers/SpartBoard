// Cloud Function unit tests for `handleJoinPlcQuizSyncGroup` (Phase 2).
// Mirrors `plcAssignmentSyncJoin.test.ts` and pins the security-critical
// Admin-SDK membership check — the rule that prevents a non-PLC-member
// from sneaking into a synced group's `participants` map by knowing the
// PLC quiz id alone.
//
// We exercise `handleJoinPlcQuizSyncGroup` with a stub Firestore rather
// than mocking the `onCall` wrapper. The wrapper's auth / argument
// validation is trivial; the transaction body is where the invariants
// live.

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

import { handleJoinPlcQuizSyncGroup } from './plcQuizSyncJoin';

// ---------------------------------------------------------------------------
// Stub Firestore — minimal surface for the transaction handler.
// ---------------------------------------------------------------------------

interface DocSnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface StubState {
  plc: Record<string, unknown> | null;
  plcQuiz: Record<string, unknown> | null;
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
    if (ref.__path.startsWith('plcs/') && !ref.__path.includes('/quizzes/')) {
      return Promise.resolve({
        exists: state.plc !== null,
        data: () => state.plc ?? undefined,
      });
    }
    if (ref.__path.includes('/quizzes/')) {
      return Promise.resolve({
        exists: state.plcQuiz !== null,
        data: () => state.plcQuiz ?? undefined,
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
const PLC_QUIZ_ID = 'pq-1';
const SYNC_GROUP_ID = 'sync-group-1';
const MEMBER_UID = 'member-a';
const NON_MEMBER_UID = 'random-uid';

let state: StubState;

beforeEach(() => {
  state = {
    plc: { memberUids: [MEMBER_UID, 'member-b'] },
    plcQuiz: { syncGroupId: SYNC_GROUP_ID, sharedBy: 'member-b' },
    group: { version: 3, participants: { 'member-b': { joinedAt: 1000 } } },
    updates: [],
  };
});

describe('handleJoinPlcQuizSyncGroup - membership gate', () => {
  it('rejects callers who are not in memberUids (permission-denied)', async () => {
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, NON_MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    // Critical invariant: a rejected caller must NOT have caused any
    // participant writes. If this ever flips the security model has
    // collapsed — anyone knowing a PLC quiz id could join the sync group
    // and start publishing edits.
    expect(state.updates).toHaveLength(0);
  });

  it('rejects when the PLC doc does not exist (not-found)', async () => {
    state.plc = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when memberUids is missing or non-array (treated as empty)', async () => {
    state.plc = {}; // no memberUids field
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('handleJoinPlcQuizSyncGroup - data shape gates', () => {
  it('rejects when the PLC quiz doc is missing (not-found)', async () => {
    state.plcQuiz = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when syncGroupId is missing (failed-precondition)', async () => {
    state.plcQuiz = {}; // exists but no syncGroupId
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects an empty-string syncGroupId (failed-precondition)', async () => {
    state.plcQuiz = { syncGroupId: '' };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when the synced group doc does not exist (not-found)', async () => {
    state.group = null;
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('handleJoinPlcQuizSyncGroup - join semantics', () => {
  it('writes a participants entry on first join and returns alreadyJoined: false', async () => {
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    const result = await handleJoinPlcQuizSyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      PLC_QUIZ_ID
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
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID);
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
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    const result = await handleJoinPlcQuizSyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      PLC_QUIZ_ID
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
    state.group = {
      plcId: PLC_ID,
      participants: { 'member-b': { joinedAt: 1000 } },
    }; // no version field
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    const result = await handleJoinPlcQuizSyncGroup(
      db,
      MEMBER_UID,
      PLC_ID,
      PLC_QUIZ_ID
    );
    expect(result.version).toBe(1);
  });
});

describe('handleJoinPlcQuizSyncGroup - editor and group-link gates', () => {
  it('rejects a viewer (permission-denied) without writing', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'member-b'],
      members: { [MEMBER_UID]: { role: 'viewer', status: 'active' } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('rejects a removed member no longer in memberUids (permission-denied)', async () => {
    state.plc = {
      memberUids: ['member-b'],
      members: { [MEMBER_UID]: { role: 'member', status: 'removed' } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('allows a rejoined member whose entry still says removed', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'member-b'],
      members: { [MEMBER_UID]: { role: 'member', status: 'removed' } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).resolves.toMatchObject({ alreadyJoined: false });
  });

  it('allows a non-viewer keyed member', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'member-b'],
      members: { [MEMBER_UID]: { role: 'member', status: 'active' } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).resolves.toMatchObject({
      alreadyJoined: false,
    });
  });

  it('rejects a header naming a group its sharer is not in (permission-denied)', async () => {
    state.plcQuiz = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = {
      version: 3,
      plcId: 'victim-plc',
      participants: { 'victim-uid': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('rejects a header with no sharedBy on a group not created for this PLC', async () => {
    state.plcQuiz = { syncGroupId: SYNC_GROUP_ID };
    state.group = { version: 3, participants: {} };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('allows a group created for this PLC when the sharer left but a member remains', async () => {
    state.plcQuiz = { syncGroupId: SYNC_GROUP_ID, sharedBy: 'gone-uid' };
    state.group = {
      version: 3,
      plcId: PLC_ID,
      participants: { 'member-b': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).resolves.toMatchObject({
      alreadyJoined: false,
    });
  });

  it('rejects a recreated PLC id whose members are not in the group', async () => {
    state.plc = { memberUids: [MEMBER_UID] };
    state.plcQuiz = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = {
      version: 3,
      plcId: PLC_ID,
      participants: { 'victim-uid': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });

  it('ignores memberUids a lead added without a members entry', async () => {
    state.plc = {
      memberUids: [MEMBER_UID, 'victim-uid'],
      members: { [MEMBER_UID]: { role: 'lead', status: 'active' } },
    };
    state.plcQuiz = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = {
      version: 3,
      plcId: PLC_ID,
      participants: { 'victim-uid': { joinedAt: 1000 } },
    };
    const db = makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
    >[0];
    await expect(
      handleJoinPlcQuizSyncGroup(db, MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });
});

describe('handleJoinPlcQuizSyncGroup - re-join and undo', () => {
  const db = () =>
    makeDb(state) as unknown as Parameters<
      typeof handleJoinPlcQuizSyncGroup
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
      handleJoinPlcQuizSyncGroup(db(), MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).resolves.toMatchObject({ alreadyJoined: true, version: 4 });
    expect(state.updates).toHaveLength(0);
  });

  it('still rejects an already-participating non-member', async () => {
    state.group = {
      version: 4,
      participants: { [NON_MEMBER_UID]: { joinedAt: 1000 } },
    };
    await expect(
      handleJoinPlcQuizSyncGroup(db(), NON_MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('lets the sharer re-join after detaching from their own sole-participant group', async () => {
    state.plcQuiz = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = { version: 3, participants: {} };
    state.markers = {
      [MEMBER_UID]: { plcId: PLC_ID, plcContentId: PLC_QUIZ_ID, detachedAt: 1 },
    };
    await expect(
      handleJoinPlcQuizSyncGroup(db(), MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).resolves.toMatchObject({ alreadyJoined: false });
    expect(state.updates).toHaveLength(1);
    expect(state.deletes).toEqual([
      `synced_quizzes/${SYNC_GROUP_ID}/plcDetached/${MEMBER_UID}`,
    ]);
  });

  it('ignores a detach marker left through a different header', async () => {
    state.plcQuiz = { syncGroupId: SYNC_GROUP_ID, sharedBy: MEMBER_UID };
    state.group = { version: 3, participants: {} };
    state.markers = {
      [MEMBER_UID]: { plcId: PLC_ID, plcContentId: 'other', detachedAt: 1 },
    };
    await expect(
      handleJoinPlcQuizSyncGroup(db(), MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
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
      [MEMBER_UID]: { plcId: PLC_ID, plcContentId: PLC_QUIZ_ID, detachedAt: 1 },
    };
    await expect(
      handleJoinPlcQuizSyncGroup(db(), MEMBER_UID, PLC_ID, PLC_QUIZ_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });
});
