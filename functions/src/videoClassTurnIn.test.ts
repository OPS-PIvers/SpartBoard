import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseAdmin', () => ({ firestore: vi.fn() }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import {
  GIVE_UP_AFTER_MS,
  TURN_IN_DELAY_MS,
  TURN_INS,
  markerId,
  newlyClosed,
  queueClosedClasses,
  runVideoClassTurnIns,
  turnInClosedVideoClass,
} from './videoClassTurnIn';

type Doc = Record<string, unknown>;

interface Store {
  docs: Map<string, Doc>;
  versions: Map<string, number>;
  updates: Array<[string, Doc]>;
  deletes: string[];
  /** Runs inside each transaction, before its reads. */
  onTx?: () => void;
  failTx?: boolean;
}

function makeDb(store: Store) {
  const ref = (path: string): Ref => ({
    path,
    id: path.split('/').pop() ?? '',
    collection: (name: string) => coll(`${path}/${name}`),
    get: () => Promise.resolve(snap(path)),
    set: (data: Doc) => {
      store.docs.set(path, { ...data });
      store.versions.set(path, (store.versions.get(path) ?? 0) + 1);
      return Promise.resolve();
    },
    delete: (pre?: { lastUpdateTime?: number }) => {
      if (
        pre?.lastUpdateTime !== undefined &&
        pre.lastUpdateTime !== store.versions.get(path)
      )
        return Promise.reject(new Error('precondition'));
      store.docs.delete(path);
      store.deletes.push(path);
      return Promise.resolve();
    },
  });
  interface Ref {
    path: string;
    id: string;
    collection: (n: string) => unknown;
    get: () => Promise<unknown>;
    set: (d: Doc) => Promise<void>;
    delete: (pre?: { lastUpdateTime?: number }) => Promise<void>;
  }
  const snap = (path: string) => ({
    ref: ref(path),
    exists: store.docs.has(path),
    data: () => store.docs.get(path),
    updateTime: store.versions.get(path),
  });
  const children = (base: string) =>
    [...store.docs.keys()].filter(
      (p) => p.startsWith(`${base}/`) && !p.slice(base.length + 1).includes('/')
    );
  type Filter = (d: Doc) => boolean;
  const query = (base: string, filters: Filter[], order?: string, n = 1e9) => ({
    where: (f: string, op: string, v: unknown) =>
      query(
        base,
        [
          ...filters,
          (d: Doc) =>
            op === '==' ? d[f] === v : (d[f] as number) <= (v as number),
        ],
        order,
        n
      ),
    orderBy: (f: string) => query(base, filters, f, n),
    limit: (k: number) => query(base, filters, order, k),
    get: () => {
      let docs = children(base)
        .filter((p) => filters.every((f) => f(store.docs.get(p) ?? {})))
        .map(snap);
      if (order)
        docs.sort(
          (a, b) =>
            ((a.data() ?? {})[order] as number) -
            ((b.data() ?? {})[order] as number)
        );
      docs = docs.slice(0, n);
      return Promise.resolve({ docs, size: docs.length });
    },
  });
  const coll = (base: string) => ({
    ...query(base, []),
    doc: (id: string) => ref(`${base}/${id}`),
  });
  return {
    collection: (name: string) => coll(name),
    runTransaction: async <T>(
      fn: (tx: {
        get: (r: Ref) => Promise<unknown>;
        update: (r: Ref, d: Doc) => void;
      }) => Promise<T>
    ) => {
      store.onTx?.();
      if (store.failTx) throw new Error('tx failed');
      return fn({
        get: (r) => Promise.resolve(snap(r.path)),
        update: (r, d) => {
          store.updates.push([r.path, d]);
          store.docs.set(r.path, { ...store.docs.get(r.path), ...d });
        },
      });
    },
  };
}

const NOW = 1_700_000_000_000;
const CLOSED_AT = NOW - 10 * 60_000;
const S = 'video_activity_sessions/s1';
let store: Store;
let db: ReturnType<typeof makeDb>;

const session = (p1: Doc, extra: Doc = {}): Doc => ({
  status: 'active',
  periodAccess: { p1: { label: 'P1', ...p1 }, p2: { state: 'open' } },
  ...extra,
});
const open = (id: string, extra: Doc) => {
  store.docs.set(`${S}/responses/${id}`, {
    studentUid: id,
    completedAt: null,
    completedAttempts: 0,
    answers: [{ questionId: 'q1', answer: 'a' }],
    ...extra,
  });
};
const turnedIn = () =>
  store.updates
    .map(([p]) => p.split('/').pop())
    .sort((a, b) => String(a).localeCompare(String(b)));
// Typed loosely: the stub covers only what the module calls.
const run = (key = 'p1', closedAt = CLOSED_AT, now = NOW) =>
  turnInClosedVideoClass(db as never, 's1', key, closedAt, now);

beforeEach(() => {
  store = { docs: new Map(), versions: new Map(), updates: [], deletes: [] };
  db = makeDb(store);
});

describe('turnInClosedVideoClass', () => {
  it("turns in the closed class's unfinished attempts at the close plus the grace", async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1', completedAttempts: 1 });
    open('pin', { classPeriod: 'P1' });
    open('b', { classId: 'p2' });
    open('otherPin', { classPeriod: 'P2' });
    store.docs.set(`${S}/responses/done`, {
      studentUid: 'done',
      classId: 'p1',
      completedAt: 3,
      answers: [{ questionId: 'q1' }],
    });
    const r = await run();
    expect(r).toEqual({ outcome: 'done', turnedIn: 2 });
    expect(turnedIn()).toEqual(['a', 'pin']);
    const at = CLOSED_AT + TURN_IN_DELAY_MS;
    expect(store.docs.get(`${S}/responses/a`)).toMatchObject({
      completedAt: at,
      completedAttempts: 2,
      turnIn: { at, claimed: at },
    });
    expect(store.docs.get(`${S}/responses/pin`)).toMatchObject({
      completedAttempts: 1,
    });
  });

  it('never stamps a time later than now', async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1' });
    await run('p1', CLOSED_AT, CLOSED_AT + 1000);
    expect(store.updates[0][1].completedAt).toBe(CLOSED_AT + 1000);
  });

  it('leaves blank joins, let-in, reopened-for and unlocked students open', async () => {
    store.docs.set(
      S,
      session(
        { state: 'closed', closedAt: CLOSED_AT },
        {
          studentAccess: { pass: NOW + 1, expired: NOW - 1 },
          reopenedFor: ['picked'],
        }
      )
    );
    for (const id of ['pass', 'expired', 'picked', 'plain'])
      open(id, { classId: 'p1' });
    open('unlocked', { classId: 'p1', unlocked: true });
    open('blank', { classId: 'p1', answers: [] });
    await run();
    expect(turnedIn()).toEqual(['expired', 'plain']);
  });

  it('is stale once the class was reopened, is only Ready, was closed again later, or is gone', async () => {
    open('a', { classId: 'p1' });
    store.docs.set(S, session({ state: 'open', closedAt: null }));
    expect((await run()).outcome).toBe('stale');
    store.docs.set(S, session({ state: 'closed' }));
    expect((await run()).outcome).toBe('stale');
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT + 1 }));
    expect((await run()).outcome).toBe('stale');
    store.docs.delete(S);
    expect((await run()).outcome).toBe('stale');
    expect(store.updates).toHaveLength(0);
  });

  it('skips rows once the class reopens, the student finishes, or is let in while it runs', async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1' });
    store.onTx = () => {
      store.docs.set(S, session({ state: 'open', closedAt: null }));
    };
    await run();
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    store.onTx = () => {
      store.docs.set(`${S}/responses/a`, {
        ...store.docs.get(`${S}/responses/a`),
        completedAt: 4,
      });
    };
    await run();
    store.docs.set(`${S}/responses/a`, {
      ...store.docs.get(`${S}/responses/a`),
      completedAt: null,
    });
    store.onTx = () => {
      store.docs.set(
        S,
        session(
          { state: 'closed', closedAt: CLOSED_AT },
          { studentAccess: { a: NOW + 60_000 } }
        )
      );
    };
    await run();
    expect(store.updates).toHaveLength(0);
  });

  it('throws when a turn-in fails so the marker is kept', async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1' });
    store.failTx = true;
    await expect(run()).rejects.toThrow('tx failed');
  });
});

describe('newlyClosed', () => {
  it('lists only classes this write closed with a closedAt', () => {
    const before = {
      periodAccess: {
        a: { state: 'open' },
        b: { state: 'closed', closedAt: 5 },
        c: { state: 'closed', closedAt: 5 },
        d: { state: 'open' },
      },
    };
    const after = {
      periodAccess: {
        a: { state: 'closed', closedAt: 9 },
        b: { state: 'closed', closedAt: 5 },
        c: { state: 'closed', closedAt: 7 },
        d: { state: 'closed' },
        e: { state: 'paused', closedAt: 9 },
      },
    };
    expect(newlyClosed(before, after)).toEqual([
      ['a', 9],
      ['c', 7],
    ]);
    expect(newlyClosed(undefined, undefined)).toEqual([]);
    expect(newlyClosed({}, { periodAccess: null })).toEqual([]);
  });
});

describe('queue and sweep', () => {
  const marker = (key = 'p1') => `${TURN_INS}/${markerId('s1', key)}`;
  const queueClose = (closedAt = CLOSED_AT) =>
    queueClosedClasses(
      db as never,
      's1',
      session({ state: 'open' }),
      session({ state: 'closed', closedAt })
    );

  it('queues one marker per close and a later close replaces it', async () => {
    expect(await queueClose()).toBe(1);
    expect(store.docs.get(marker())).toEqual({
      sessionId: 's1',
      classKey: 'p1',
      closedAt: CLOSED_AT,
      dueAt: CLOSED_AT + TURN_IN_DELAY_MS,
    });
    await queueClose(CLOSED_AT + 5);
    expect(store.docs.get(marker())?.closedAt).toBe(CLOSED_AT + 5);
    expect(
      [...store.docs.keys()].filter((k) => k.startsWith(TURN_INS))
    ).toHaveLength(1);
  });

  it('turns in due classes, clears their markers and waits on ones not yet due', async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1' });
    await queueClose();
    const early = await runVideoClassTurnIns(
      db as never,
      CLOSED_AT + TURN_IN_DELAY_MS - 1
    );
    expect(early.markers).toBe(0);
    expect(store.updates).toHaveLength(0);
    const r = await runVideoClassTurnIns(db as never, NOW);
    expect(r).toMatchObject({ markers: 1, turnedIn: 1, stale: 0, failed: 0 });
    expect(turnedIn()).toEqual(['a']);
    expect(store.docs.has(marker())).toBe(false);
  });

  it('clears a stale marker without writing', async () => {
    store.docs.set(S, session({ state: 'open', closedAt: null }));
    open('a', { classId: 'p1' });
    await queueClose();
    const r = await runVideoClassTurnIns(db as never, NOW);
    expect(r).toMatchObject({ stale: 1, turnedIn: 0 });
    expect(store.docs.has(marker())).toBe(false);
  });

  it('keeps a failed marker for the next run, and drops it after a week', async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1' });
    await queueClose();
    store.failTx = true;
    const r = await runVideoClassTurnIns(db as never, NOW);
    expect(r).toMatchObject({ failed: 1, gaveUp: 0 });
    expect(store.docs.has(marker())).toBe(true);
    const late = await runVideoClassTurnIns(
      db as never,
      CLOSED_AT + GIVE_UP_AFTER_MS + 1
    );
    expect(late).toMatchObject({ failed: 1, gaveUp: 1 });
    expect(store.docs.has(marker())).toBe(false);
  });

  it('keeps a marker a newer close rewrote during the run', async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1' });
    await queueClose();
    store.onTx = () => {
      store.onTx = undefined;
      void queueClose(CLOSED_AT + 60_000);
    };
    await runVideoClassTurnIns(db as never, NOW);
    expect(store.docs.get(marker())?.closedAt).toBe(CLOSED_AT + 60_000);
  });

  it('drops a malformed marker', async () => {
    store.docs.set(marker(), { sessionId: 's1', dueAt: 0 });
    store.versions.set(marker(), 1);
    await runVideoClassTurnIns(db as never, NOW);
    expect(store.docs.has(marker())).toBe(false);
  });
});
