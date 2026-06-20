// Cloud Function unit tests for `handleDetachPlcSyncLinkage` (Wave 4,
// PRD §5.3 / Decision 5.3). Mirrors `plcQuizSyncJoin.test.ts` and pins the
// security-critical Admin-SDK membership check — the rule that prevents a
// non-PLC-member from mutating a synced group's `participants` map by
// knowing a PLC content id alone — plus the idempotency + missing-group
// contracts.
//
// We exercise `handleDetachPlcSyncLinkage` with a stub Firestore rather
// than mocking the `onCall` wrapper. The wrapper's auth / argument
// validation is trivial; the transaction body is where the invariants
// live.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock firebase-admin so the module-level `functionsInit` side effect
// no-ops (`admin.apps.length > 0`) and we have a stable surface.
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

// `./functionsInit` calls `setGlobalOptions` at import time.
vi.mock('firebase-functions/v2', () => ({
  setGlobalOptions: vi.fn(),
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

import {
  handleDetachPlcSyncLinkage,
  type PlcSyncLinkageKind,
} from './detachPlcSyncLinkage';

// ---------------------------------------------------------------------------
// Stub Firestore — minimal surface for the transaction handler.
// ---------------------------------------------------------------------------

interface DocSnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface StubState {
  plc: Record<string, unknown> | null;
  header: Record<string, unknown> | null;
  group: Record<string, unknown> | null;
  /** Captured tx.update() calls — `[path, patch]` per call. */
  updates: Array<{ path: string; patch: Record<string, unknown> }>;
}

/** Header subcollection name for a given kind (mirrors KIND_CONFIG). */
const HEADER_COLLECTION: Record<PlcSyncLinkageKind, string> = {
  quiz: 'quizzes',
  'video-activity': 'video_activities',
};
const GROUP_COLLECTION: Record<PlcSyncLinkageKind, string> = {
  quiz: 'synced_quizzes',
  'video-activity': 'synced_video_activities',
};

function makeDb(state: StubState, kind: PlcSyncLinkageKind) {
  const headerColl = HEADER_COLLECTION[kind];
  const groupColl = GROUP_COLLECTION[kind];

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
      !ref.__path.includes(`/${headerColl}/`)
    ) {
      return Promise.resolve({
        exists: state.plc !== null,
        data: () => state.plc ?? undefined,
      });
    }
    if (ref.__path.includes(`/${headerColl}/`)) {
      return Promise.resolve({
        exists: state.header !== null,
        data: () => state.header ?? undefined,
      });
    }
    if (ref.__path.startsWith(`${groupColl}/`)) {
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
const CONTENT_ID = 'pc-1';
const SYNC_GROUP_ID = 'sync-group-1';
const MEMBER_UID = 'member-a';
const NON_MEMBER_UID = 'random-uid';

let state: StubState;

function db(kind: PlcSyncLinkageKind = 'quiz') {
  return makeDb(state, kind) as unknown as Parameters<
    typeof handleDetachPlcSyncLinkage
  >[0];
}

beforeEach(() => {
  state = {
    plc: { memberUids: [MEMBER_UID, 'member-b'] },
    header: { syncGroupId: SYNC_GROUP_ID },
    group: {
      version: 3,
      participants: {
        [MEMBER_UID]: { joinedAt: 1000 },
        'member-b': { joinedAt: 2000 },
      },
    },
    updates: [],
  };
});

describe('handleDetachPlcSyncLinkage - membership gate', () => {
  it('rejects callers who are not in memberUids (permission-denied)', async () => {
    await expect(
      handleDetachPlcSyncLinkage(
        db(),
        NON_MEMBER_UID,
        PLC_ID,
        'quiz',
        CONTENT_ID
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    // A rejected caller must NOT have caused any participant writes — else a
    // non-member could evict participants from a group they don't belong to.
    expect(state.updates).toHaveLength(0);
  });

  it('rejects when the PLC doc does not exist (not-found)', async () => {
    state.plc = null;
    await expect(
      handleDetachPlcSyncLinkage(db(), MEMBER_UID, PLC_ID, 'quiz', CONTENT_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when memberUids is missing or non-array (treated as empty)', async () => {
    state.plc = {}; // no memberUids field
    await expect(
      handleDetachPlcSyncLinkage(db(), MEMBER_UID, PLC_ID, 'quiz', CONTENT_ID)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('handleDetachPlcSyncLinkage - data shape gates', () => {
  it('rejects when the PLC content header is missing (not-found)', async () => {
    state.header = null;
    await expect(
      handleDetachPlcSyncLinkage(db(), MEMBER_UID, PLC_ID, 'quiz', CONTENT_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects when syncGroupId is missing (failed-precondition)', async () => {
    state.header = {}; // exists but no syncGroupId
    await expect(
      handleDetachPlcSyncLinkage(db(), MEMBER_UID, PLC_ID, 'quiz', CONTENT_ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects an empty-string syncGroupId (failed-precondition)', async () => {
    state.header = { syncGroupId: '' };
    await expect(
      handleDetachPlcSyncLinkage(db(), MEMBER_UID, PLC_ID, 'quiz', CONTENT_ID)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('throws not-found when the synced group doc does not exist', async () => {
    state.group = null;
    await expect(
      handleDetachPlcSyncLinkage(db(), MEMBER_UID, PLC_ID, 'quiz', CONTENT_ID)
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('handleDetachPlcSyncLinkage - detach semantics', () => {
  it('removes the caller from participants and preserves teammates', async () => {
    const result = await handleDetachPlcSyncLinkage(
      db(),
      MEMBER_UID,
      PLC_ID,
      'quiz',
      CONTENT_ID
    );
    expect(result).toEqual({
      groupId: SYNC_GROUP_ID,
      remainingParticipants: 1,
      alreadyDetached: false,
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].path).toBe(`synced_quizzes/${SYNC_GROUP_ID}`);
    const patch = state.updates[0].patch as {
      participants: Record<string, unknown>;
      updatedAt: number;
    };
    // The caller is gone; the teammate remains untouched.
    expect(Object.keys(patch.participants)).toEqual(['member-b']);
    expect(typeof patch.updatedAt).toBe('number');
  });

  it('leaves an empty group doc in place when the last participant detaches', async () => {
    state.group = {
      version: 7,
      participants: { [MEMBER_UID]: { joinedAt: 1000 } },
    };
    const result = await handleDetachPlcSyncLinkage(
      db(),
      MEMBER_UID,
      PLC_ID,
      'quiz',
      CONTENT_ID
    );
    expect(result).toMatchObject({
      remainingParticipants: 0,
      alreadyDetached: false,
    });
    // The group doc is updated (participants emptied) but NOT deleted —
    // re-share must still resolve the doc rather than 404. Reaping is the
    // nightly gcPlcOrphans job's responsibility.
    expect(state.updates).toHaveLength(1);
    const patch = state.updates[0].patch as {
      participants: Record<string, unknown>;
    };
    expect(Object.keys(patch.participants)).toHaveLength(0);
  });

  it('is idempotent on re-detach: returns alreadyDetached without writing', async () => {
    state.group = {
      version: 5,
      participants: { 'member-b': { joinedAt: 2000 } },
    };
    const result = await handleDetachPlcSyncLinkage(
      db(),
      MEMBER_UID,
      PLC_ID,
      'quiz',
      CONTENT_ID
    );
    expect(result).toEqual({
      groupId: SYNC_GROUP_ID,
      remainingParticipants: 1,
      alreadyDetached: true,
    });
    // No update — re-detaching must NOT rewrite the participants map or
    // bump version. A no-op write would race the owning client's
    // strictly-monotonic version rule.
    expect(state.updates).toHaveLength(0);
  });

  it('tolerates a group doc with no participants map (treated as empty)', async () => {
    state.group = { version: 2 }; // no participants field
    const result = await handleDetachPlcSyncLinkage(
      db(),
      MEMBER_UID,
      PLC_ID,
      'quiz',
      CONTENT_ID
    );
    expect(result).toEqual({
      groupId: SYNC_GROUP_ID,
      remainingParticipants: 0,
      alreadyDetached: true,
    });
    expect(state.updates).toHaveLength(0);
  });
});

describe('handleDetachPlcSyncLinkage - video-activity kind', () => {
  it('resolves the video_activities header + synced_video_activities group', async () => {
    const result = await handleDetachPlcSyncLinkage(
      db('video-activity'),
      MEMBER_UID,
      PLC_ID,
      'video-activity',
      CONTENT_ID
    );
    expect(result).toMatchObject({
      groupId: SYNC_GROUP_ID,
      remainingParticipants: 1,
      alreadyDetached: false,
    });
    expect(state.updates).toHaveLength(1);
    // Critical: a quiz-kind detach must never touch synced_video_activities
    // and vice versa. The update lands on the VA collection.
    expect(state.updates[0].path).toBe(
      `synced_video_activities/${SYNC_GROUP_ID}`
    );
  });

  it('rejects a non-member on the video-activity path too (permission-denied)', async () => {
    await expect(
      handleDetachPlcSyncLinkage(
        db('video-activity'),
        NON_MEMBER_UID,
        PLC_ID,
        'video-activity',
        CONTENT_ID
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.updates).toHaveLength(0);
  });
});
