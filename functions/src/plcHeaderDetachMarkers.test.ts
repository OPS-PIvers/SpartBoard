// Leave ("Stop syncing") writes PLC header markers only for a real participant's own headers.

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

import { handleLeaveSyncedQuizGroup } from './syncedQuizGroups';
import { handleLeaveSyncedVideoActivityGroup } from './syncedVideoActivityGroups';

interface HeaderDoc {
  /** Full path, e.g. plcs/p1/quizzes/h1. */
  path: string;
  data: Record<string, unknown>;
}

interface State {
  group: Record<string, unknown> | null;
  headers: HeaderDoc[];
  updates: Array<{ path: string; patch: Record<string, unknown> }>;
  sets: Array<{ path: string; data: Record<string, unknown> }>;
  queries: string[];
}

function makeDb(state: State) {
  const docRef = (path: string) => ({
    __path: path,
    collection: (sub: string) => collRef(`${path}/${sub}`),
  });
  const collRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  type Query = {
    __group: string;
    __filters: Array<[string, unknown]>;
    where: (f: string, op: string, v: unknown) => Query;
  };
  const query = (group: string, filters: Array<[string, unknown]>): Query => ({
    __group: group,
    __filters: filters,
    where: (f, _op, v) => query(group, [...filters, [f, v]]),
  });
  const refFor = (path: string) => {
    const seg = path.split('/');
    let ref: Record<string, unknown> | null = null;
    for (let i = 0; i < seg.length; i++) {
      ref = { id: seg[i], parent: ref };
    }
    return ref as { id: string; parent: unknown };
  };
  const get = (ref: { __path?: string } & Partial<Query>) => {
    if (ref.__group) {
      state.queries.push(ref.__group);
      const docs = state.headers
        .filter((h) => {
          const seg = h.path.split('/');
          return (
            seg[seg.length - 2] === ref.__group &&
            (ref.__filters ?? []).every(([f, v]) => h.data[f] === v)
          );
        })
        .map((h) => {
          const r = refFor(h.path);
          return { id: r.id, ref: r, data: () => h.data };
        });
      return Promise.resolve({ docs });
    }
    return Promise.resolve({
      exists: state.group !== null,
      data: () => state.group ?? undefined,
    });
  };
  return {
    collection: (name: string) => collRef(name),
    collectionGroup: (name: string) => query(name, []),
    runTransaction: <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get,
        update: (ref: { __path: string }, patch: Record<string, unknown>) =>
          state.updates.push({ path: ref.__path, patch }),
        set: (ref: { __path: string }, data: Record<string, unknown>) =>
          state.sets.push({ path: ref.__path, data }),
      }),
  };
}

const GROUP = 'g1';
const LEAVER = 'sharer';
const ATTACKER = 'attacker';

let state: State;
beforeEach(() => {
  state = {
    group: { participants: { [LEAVER]: { joinedAt: 1 } } },
    headers: [
      {
        path: 'plcs/p1/quizzes/h1',
        data: { sharedBy: LEAVER, syncGroupId: GROUP },
      },
      {
        path: 'plcs/p2/assignments/a1',
        data: { sharedBy: LEAVER, syncGroupId: GROUP },
      },
      // Not a PLC header: same collection name elsewhere.
      {
        path: 'users/u/quizzes/x',
        data: { sharedBy: LEAVER, syncGroupId: GROUP },
      },
      // Another member's header for the same group.
      {
        path: 'plcs/p1/quizzes/h2',
        data: { sharedBy: ATTACKER, syncGroupId: GROUP },
      },
      // The leaver's header for another group.
      {
        path: 'plcs/p1/quizzes/h3',
        data: { sharedBy: LEAVER, syncGroupId: 'other' },
      },
    ],
    updates: [],
    sets: [],
    queries: [],
  };
});

const quizDb = () =>
  makeDb(state) as unknown as Parameters<typeof handleLeaveSyncedQuizGroup>[0];

describe('leave writes PLC header markers', () => {
  it("marks only the participant's own PLC headers for this group", async () => {
    await handleLeaveSyncedQuizGroup(quizDb(), LEAVER, GROUP);
    expect(state.updates).toHaveLength(1);
    expect(state.sets.map((s) => s.path).sort()).toEqual([
      `synced_quizzes/${GROUP}/plcDetached/hdr:p1:quizzes:h1`,
      `synced_quizzes/${GROUP}/plcDetached/hdr:p2:assignments:a1`,
    ]);
    expect(state.sets[0].data).toMatchObject({
      plcId: 'p1',
      plcContentId: 'h1',
      sharedBy: LEAVER,
    });
    expect(typeof state.sets[0].data.detachedAt).toBe('number');
  });

  it("a non-participant's leave writes no marker and runs no query", async () => {
    state.headers.push({
      path: 'plcs/p1/quizzes/forged',
      data: { sharedBy: ATTACKER, syncGroupId: GROUP },
    });
    const res = await handleLeaveSyncedQuizGroup(quizDb(), ATTACKER, GROUP);
    expect(res.remainingParticipants).toBe(1);
    expect(state.updates).toHaveLength(0);
    expect(state.sets).toHaveLength(0);
    expect(state.queries).toHaveLength(0);
  });

  it('video leave marks the video_activities headers', async () => {
    state.headers = [
      {
        path: 'plcs/p1/video_activities/v1',
        data: { sharedBy: LEAVER, syncGroupId: GROUP },
      },
    ];
    await handleLeaveSyncedVideoActivityGroup(
      makeDb(state) as unknown as Parameters<
        typeof handleLeaveSyncedVideoActivityGroup
      >[0],
      LEAVER,
      GROUP
    );
    expect(state.queries).toEqual(['video_activities']);
    expect(state.sets.map((s) => s.path)).toEqual([
      `synced_video_activities/${GROUP}/plcDetached/hdr:p1:video_activities:v1`,
    ]);
  });

  it("a non-participant's video leave writes no marker", async () => {
    await handleLeaveSyncedVideoActivityGroup(
      makeDb(state) as unknown as Parameters<
        typeof handleLeaveSyncedVideoActivityGroup
      >[0],
      ATTACKER,
      GROUP
    );
    expect(state.sets).toHaveLength(0);
    expect(state.queries).toHaveLength(0);
  });
});
