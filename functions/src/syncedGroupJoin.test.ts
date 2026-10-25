// Share-link joins for synced quiz and video-activity groups: a share only
// invites into a group its author currently participates in.

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

vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: vi.fn() }));

import {
  handleJoinSyncedQuizGroup,
  joinSyncedQuizGroup,
} from './syncedQuizGroups';
import {
  handleJoinSyncedVideoActivityGroup,
  joinSyncedVideoActivityGroup,
} from './syncedVideoActivityGroups';

interface DocSnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface StubState {
  share: Record<string, unknown> | null;
  group: Record<string, unknown> | null;
  updates: Array<{ path: string; patch: Record<string, unknown> }>;
}

function makeDb(state: StubState) {
  const get = (ref: { __path: string }): Promise<DocSnap> => {
    const value = ref.__path.startsWith('shared_') ? state.share : state.group;
    return Promise.resolve({
      exists: value !== null,
      data: () => value ?? undefined,
    });
  };
  const docRef = (path: string) => ({
    __path: path,
    get: () => get({ __path: path }),
  });
  return {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
    }),
    runTransaction: async <T>(
      fn: (tx: {
        get: typeof get;
        update: (
          ref: { __path: string },
          patch: Record<string, unknown>
        ) => void;
      }) => Promise<T>
    ): Promise<T> =>
      fn({
        get,
        update: (ref, patch) => {
          state.updates.push({ path: ref.__path, patch });
        },
      }),
  };
}

const GROUP_ID = 'group-1';
const OWNER = 'teacher-owner';
const ATTACKER = 'attacker';
const JOINER = 'teacher-joiner';

const handlers = [
  ['quiz', handleJoinSyncedQuizGroup],
  ['video activity', handleJoinSyncedVideoActivityGroup],
] as const;

let state: StubState;

beforeEach(() => {
  state = {
    share: { originalAuthor: OWNER, syncGroupId: GROUP_ID },
    group: { version: 4, participants: { [OWNER]: { joinedAt: 1 } } },
    updates: [],
  };
});

describe.each(handlers)('%s share join', (_label, handler) => {
  const db = () => makeDb(state) as unknown as Parameters<typeof handler>[0];

  it('adds the caller when the share author is a participant', async () => {
    await expect(handler(db(), JOINER, 'share-1')).resolves.toMatchObject({
      groupId: GROUP_ID,
      alreadyJoined: false,
    });
    expect(state.updates).toHaveLength(1);
  });

  it('rejects a forged share whose author is not a participant', async () => {
    state.share = { originalAuthor: ATTACKER, syncGroupId: GROUP_ID };
    await expect(handler(db(), ATTACKER, 'forged')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(state.updates).toHaveLength(0);
  });

  it('rejects a share with no author', async () => {
    state.share = { syncGroupId: GROUP_ID };
    await expect(handler(db(), JOINER, 'share-1')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(state.updates).toHaveLength(0);
  });

  it('stays a no-op for a caller who already participates', async () => {
    state.share = { originalAuthor: 'gone', syncGroupId: GROUP_ID };
    await expect(handler(db(), OWNER, 'share-1')).resolves.toMatchObject({
      alreadyJoined: true,
    });
    expect(state.updates).toHaveLength(0);
  });
});

describe.each([
  ['quiz', joinSyncedQuizGroup],
  ['video activity', joinSyncedVideoActivityGroup],
] as const)('%s join callable', (_label, callable) => {
  const call = (token: Record<string, unknown>) =>
    (callable as unknown as (req: unknown) => Promise<unknown>)({
      auth: { uid: ATTACKER, token },
      data: { shareId: 'forged' },
    });

  it('refuses anonymous callers', async () => {
    await expect(
      call({ firebase: { sign_in_provider: 'anonymous' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses studentRole callers', async () => {
    await expect(
      call({ studentRole: true, firebase: { sign_in_provider: 'custom' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
