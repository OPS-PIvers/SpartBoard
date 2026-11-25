import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase-functions')>()),
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import {
  CLOSE_NOW_SLACK_MS,
  GIVE_UP_AFTER_MS,
  newlyEnded,
  queueSessionTurnIns,
  queueVideoRunTurnIn,
  turnInMarker,
  RETRY_BACKOFF_MS,
  TURN_IN_DELAY_MS,
  TURN_INS,
  markerId,
  newlyClosed,
  queueClosedClasses,
  runVideoClassTurnIns,
  turnInClosedVideoClass,
} from './turnInQueue';

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
    update: (data: Doc, pre?: { lastUpdateTime?: number }) => {
      if (
        pre?.lastUpdateTime !== undefined &&
        pre.lastUpdateTime !== store.versions.get(path)
      )
        return Promise.reject(new Error('precondition'));
      store.docs.set(path, { ...store.docs.get(path), ...data });
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
    update: (d: Doc, pre?: { lastUpdateTime?: number }) => Promise<void>;
    delete: (pre?: { lastUpdateTime?: number }) => Promise<void>;
  }
  const snap = (path: string) => ({
    ref: ref(path),
    id: path.split('/').pop() ?? '',
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
            op === '=='
              ? d[f] === v
              : op === 'in'
                ? (v as unknown[]).includes(d[f])
                : (d[f] as number) <= (v as number),
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
        get: (r: Ref) => Promise<ReturnType<typeof snap>>;
        update: (r: Ref, d: Doc) => void;
        set: (r: Ref, d: Doc) => void;
      }) => Promise<T>
    ) => {
      store.onTx?.();
      if (store.failTx) throw new Error('tx failed');
      return fn({
        get: (r) => Promise.resolve(snap(r.path)),
        set: (r, d) => {
          void r.set(d);
        },
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
  turnInClosedVideoClass(db as never, 's1', key, closedAt, now, closedAt);

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

  it('stamps a student whose pass ran out at the real time', async () => {
    store.docs.set(
      S,
      session(
        { state: 'closed', closedAt: CLOSED_AT },
        { studentAccess: { a: NOW - 1 } }
      )
    );
    open('a', { classId: 'p1' });
    open('b', { classId: 'p1' });
    await run();
    const byId = Object.fromEntries(
      store.updates.map(([p, d]): [string, unknown] => [
        p.split('/').pop() ?? '',
        d.completedAt,
      ])
    );
    expect(byId).toEqual({ a: NOW, b: CLOSED_AT + TURN_IN_DELAY_MS });
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
  const queueClose = (closedAt = CLOSED_AT, serverNow = closedAt) =>
    queueClosedClasses(
      db as never,
      's1',
      session({ state: 'open' }),
      session({ state: 'closed', closedAt }),
      serverNow
    );

  it('queues one marker per close and a later close replaces it', async () => {
    expect(await queueClose()).toBe(1);
    expect(store.docs.get(marker())).toEqual({
      kind: 'videoActivity',
      scope: 'class',
      sessionId: 's1',
      classKey: 'p1',
      closedAt: CLOSED_AT,
      serverClosedAt: CLOSED_AT,
      queuedAt: CLOSED_AT,
      attempts: 0,
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

  it('re-queues a closed class for its first live pass expiry, then turns the student in', async () => {
    const end = NOW + 30 * 60_000;
    store.docs.set(
      S,
      session(
        { state: 'closed', closedAt: CLOSED_AT },
        { studentAccess: { late: end, later: end + 60_000 } }
      )
    );
    open('late', { classId: 'p1' });
    open('later', { classId: 'p1' });
    await queueClose();
    const r = await runVideoClassTurnIns(db as never, NOW);
    expect(r).toMatchObject({ turnedIn: 0, requeued: 1 });
    expect(store.docs.get(marker())).toMatchObject({ dueAt: end, attempts: 0 });
    expect((await runVideoClassTurnIns(db as never, end - 1)).markers).toBe(0);
    const r2 = await runVideoClassTurnIns(db as never, end + 1);
    expect(r2).toMatchObject({ turnedIn: 1, requeued: 1 });
    expect(turnedIn()).toEqual(['late']);
    expect(store.docs.get(marker())).toMatchObject({ dueAt: end + 60_000 });
    await runVideoClassTurnIns(db as never, end + 60_001);
    expect(turnedIn()).toEqual(['late', 'later']);
    expect(store.docs.has(marker())).toBe(false);
  });

  it('does not re-queue for reopened-for or unlocked students, but does for a blank row with a live pass', async () => {
    store.docs.set(
      S,
      session(
        { state: 'closed', closedAt: CLOSED_AT },
        { studentAccess: { u: NOW + 1000 }, reopenedFor: ['picked'] }
      )
    );
    open('picked', { classId: 'p1' });
    open('u', { classId: 'p1', unlocked: true });
    await queueClose();
    const r = await runVideoClassTurnIns(db as never, NOW);
    expect(r.requeued).toBe(0);
    expect(store.docs.has(marker())).toBe(false);
    open('blank', { classId: 'p1', answers: [] });
    store.docs.set(
      S,
      session(
        { state: 'closed', closedAt: CLOSED_AT },
        { studentAccess: { blank: NOW + 1000 } }
      )
    );
    await queueClose();
    expect((await runVideoClassTurnIns(db as never, NOW)).requeued).toBe(1);
    const r2 = await runVideoClassTurnIns(db as never, NOW + 2000);
    expect(r2).toMatchObject({ turnedIn: 0, requeued: 0 });
    expect(store.docs.has(marker())).toBe(false);
  });

  it('queues a marker when a pass is granted after the class closed', async () => {
    const closed = session({ state: 'closed', closedAt: CLOSED_AT });
    const end = NOW + 60_000;
    await queueClosedClasses(
      db as never,
      's1',
      closed,
      { ...closed, studentAccess: { a: end } },
      NOW
    );
    expect(store.docs.get(marker())).toMatchObject({
      closedAt: CLOSED_AT,
      dueAt: end,
    });
    const end2 = NOW + 30_000;
    await queueClosedClasses(
      db as never,
      's1',
      { ...closed, studentAccess: { a: end } },
      { ...closed, studentAccess: { a: end, b: end2 } },
      NOW
    );
    expect(store.docs.get(marker())?.dueAt).toBe(end2);
    await queueClosedClasses(
      db as never,
      's1',
      { ...closed, studentAccess: { a: end, b: end2 } },
      { ...closed, studentAccess: { a: end, b: end2, c: end + 1 } },
      NOW
    );
    expect(store.docs.get(marker())?.dueAt).toBe(end2);
  });

  it('queues a marker when a reopen is removed from a closed class', async () => {
    const closed = session({ state: 'closed', closedAt: CLOSED_AT });
    await queueClosedClasses(
      db as never,
      's1',
      { ...closed, reopenedFor: ['a'] },
      closed,
      NOW
    );
    expect(store.docs.get(marker())?.dueAt).toBe(NOW + TURN_IN_DELAY_MS);
  });

  it('counts a pass granted while a run is in flight', async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1' });
    open('b', { classId: 'p1' });
    const end = NOW + 60_000;
    store.onTx = () => {
      store.docs.set(
        S,
        session(
          { state: 'closed', closedAt: CLOSED_AT },
          { studentAccess: { b: end } }
        )
      );
    };
    const r = await run();
    expect(r.recheckAt).toBe(end);
  });

  it('clears a stale marker without writing', async () => {
    store.docs.set(S, session({ state: 'open', closedAt: null }));
    open('a', { classId: 'p1' });
    await queueClose();
    const r = await runVideoClassTurnIns(db as never, NOW);
    expect(r).toMatchObject({ stale: 1, turnedIn: 0 });
    expect(store.docs.has(marker())).toBe(false);
  });

  it('backs a failed marker off so newer ones run, and drops it after a week', async () => {
    store.docs.set(S, session({ state: 'closed', closedAt: CLOSED_AT }));
    open('a', { classId: 'p1' });
    await queueClose();
    store.failTx = true;
    const r = await runVideoClassTurnIns(db as never, NOW);
    expect(r).toMatchObject({ failed: 1, gaveUp: 0 });
    expect(store.docs.get(marker())).toMatchObject({
      attempts: 1,
      dueAt: NOW + RETRY_BACKOFF_MS,
    });
    expect((await runVideoClassTurnIns(db as never, NOW + 1)).markers).toBe(0);
    const late = await runVideoClassTurnIns(
      db as never,
      CLOSED_AT + GIVE_UP_AFTER_MS + 1
    );
    expect(late).toMatchObject({ failed: 1, gaveUp: 1 });
    expect(store.docs.has(marker())).toBe(false);
  });

  it('stamps from the server time, not the teacher clock', async () => {
    const skewed = CLOSED_AT + 60 * 60_000;
    store.docs.set(S, session({ state: 'closed', closedAt: skewed }));
    open('a', { classId: 'p1' });
    await queueClose(skewed, CLOSED_AT);
    expect(store.docs.get(marker())?.dueAt).toBe(CLOSED_AT + TURN_IN_DELAY_MS);
    await runVideoClassTurnIns(db as never, NOW);
    expect(store.updates[0][1].completedAt).toBe(CLOSED_AT + TURN_IN_DELAY_MS);
  });

  it('orders closes by server time, not the teacher clock', async () => {
    await queueClose(CLOSED_AT + 5, CLOSED_AT + 5);
    await queueClose(CLOSED_AT, CLOSED_AT);
    expect(store.docs.get(marker())?.closedAt).toBe(CLOSED_AT + 5);
    await queueClose(CLOSED_AT - 50, CLOSED_AT + 60);
    expect(store.docs.get(marker())?.closedAt).toBe(CLOSED_AT - 50);
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

describe('every kind', () => {
  const Q = 'quiz_sessions/q1';
  const G = 'guided_learning_sessions/g1';
  const V = 'video_activity_sessions/v1';
  const yes = () => Promise.resolve(true);
  const no = () => Promise.resolve(false);
  const markers = () =>
    [...store.docs.entries()].filter(([k]) => k.startsWith(`${TURN_INS}/`));

  describe('newlyEnded', () => {
    it('reads a quiz End and a Guided Learning close now, not a schedule', () => {
      expect(
        newlyEnded(
          'quiz',
          { status: 'active' },
          { status: 'ended', endedAt: 5 },
          9
        )
      ).toBe(5);
      expect(
        newlyEnded(
          'quiz',
          { status: 'ended', endedAt: 5 },
          { status: 'ended', endedAt: 5 },
          9
        )
      ).toBeNull();
      expect(newlyEnded('guidedLearning', {}, { closeAt: NOW }, NOW)).toBe(NOW);
      expect(
        newlyEnded(
          'guidedLearning',
          {},
          { closeAt: NOW + CLOSE_NOW_SLACK_MS + 1 },
          NOW
        )
      ).toBeNull();
      expect(
        newlyEnded('guidedLearning', { closeAt: NOW }, { closeAt: NOW }, NOW)
      ).toBeNull();
      expect(
        newlyEnded('videoActivity', {}, { status: 'ended', endedAt: 5 }, 9)
      ).toBeNull();
    });
  });

  describe('quiz', () => {
    const quizResp = (id: string, extra: Doc) =>
      store.docs.set(`${Q}/responses/${id}`, {
        studentUid: id,
        status: 'in-progress',
        answers: [{ questionId: 'q1', answer: 'a', status: 'draft' }],
        ...extra,
      });
    const ended = {
      status: 'ended',
      endedAt: CLOSED_AT,
      publicQuestions: [{ id: 'q1' }, { id: 'q2' }],
      completenessModel: 1,
    };

    it('queues an End only with the preview, then turns everyone in at the end plus the grace', async () => {
      expect(
        await queueSessionTurnIns(
          db as never,
          'quiz',
          'q1',
          { status: 'active' },
          ended,
          CLOSED_AT,
          no
        )
      ).toBe(0);
      expect(markers()).toEqual([]);
      expect(
        await queueSessionTurnIns(
          db as never,
          'quiz',
          'q1',
          { status: 'active' },
          ended,
          CLOSED_AT,
          yes
        )
      ).toBe(1);
      store.docs.set(Q, { ...ended, studentAccess: { a: NOW + 60_000 } });
      quizResp('a', {});
      quizResp('b', { status: 'joined', answers: [] });
      quizResp('paper', {
        status: 'joined',
        answers: [],
        paperWrittenBatchId: 'x',
      });
      quizResp('done', { status: 'completed' });
      const r = await runVideoClassTurnIns(db as never, NOW);
      expect(r).toMatchObject({ markers: 1, turnedIn: 2 });
      expect(turnedIn()).toEqual(['a', 'b']);
      const at = CLOSED_AT + TURN_IN_DELAY_MS;
      expect(store.docs.get(`${Q}/responses/a`)).toMatchObject({
        status: 'completed',
        submittedAt: at,
        turnIn: { at, claimed: at },
      });
      expect(markers()).toEqual([]);
    });

    it('is stale once the quiz is reopened', async () => {
      store.docs.set(Q, { ...ended, status: 'paused', endedAt: null });
      quizResp('a', {});
      const r = await turnInMarker(
        db as never,
        {
          kind: 'quiz',
          scope: 'run',
          sessionId: 'q1',
          classKey: '',
          closedAt: CLOSED_AT,
        },
        NOW
      );
      expect(r.outcome).toBe('stale');
      expect(store.updates).toEqual([]);
    });

    it('turns in a closed class but keeps a Schedule pass for later open', async () => {
      store.docs.set(Q, {
        status: 'active',
        publicQuestions: [{ id: 'q1' }],
        periodAccess: {
          p1: { state: 'closed', closedAt: CLOSED_AT, label: 'P1' },
          p2: { state: 'open' },
        },
        studentAccess: { later: NOW + 3_600_000 },
        studentAccessFrom: { later: NOW + 600_000 },
      });
      quizResp('a', { classId: 'p1' });
      quizResp('later', { classId: 'p1' });
      quizResp('other', { classId: 'p2' });
      const r = await turnInMarker(
        db as never,
        {
          kind: 'quiz',
          scope: 'class',
          sessionId: 'q1',
          classKey: 'p1',
          closedAt: CLOSED_AT,
        },
        NOW,
        CLOSED_AT
      );
      expect(r).toMatchObject({
        outcome: 'done',
        turnedIn: 1,
        recheckAt: NOW + 3_600_000,
      });
      expect(turnedIn()).toEqual(['a']);
    });
  });

  describe('guided learning', () => {
    const glResp = (id: string, extra: Doc) =>
      store.docs.set(`${G}/responses/${id}`, {
        answers: [{ stepId: 's', answer: 'x', isCorrect: null }],
        ...extra,
      });

    it('queues a sub End close and turns in all but blank joins', async () => {
      expect(
        await queueSessionTurnIns(
          db as never,
          'guidedLearning',
          'g1',
          { closeAt: null },
          { closeAt: CLOSED_AT },
          CLOSED_AT,
          yes
        )
      ).toBe(1);
      store.docs.set(G, { closeAt: CLOSED_AT });
      glResp('a', {});
      glResp('blank', { answers: [] });
      glResp('done', { completedAt: 3 });
      const r = await runVideoClassTurnIns(db as never, NOW);
      expect(r.turnedIn).toBe(1);
      expect(turnedIn()).toEqual(['a']);
      expect(store.docs.get(`${G}/responses/a`)?.completedAt).toBe(
        CLOSED_AT + TURN_IN_DELAY_MS
      );
    });

    it('a scheduled close queues nothing, and a Reopen makes the marker stale', async () => {
      expect(
        await queueSessionTurnIns(
          db as never,
          'guidedLearning',
          'g1',
          {},
          { closeAt: NOW + 86_400_000 },
          NOW,
          yes
        )
      ).toBe(0);
      store.docs.set(G, { closeAt: null });
      glResp('a', {});
      const r = await turnInMarker(
        db as never,
        {
          kind: 'guidedLearning',
          scope: 'run',
          sessionId: 'g1',
          classKey: '',
          closedAt: CLOSED_AT,
        },
        NOW
      );
      expect(r.outcome).toBe('stale');
    });

    it('a closed class leaves its blank joins and reopened students open', async () => {
      store.docs.set(G, {
        periodAccess: {
          p1: { state: 'closed', closedAt: CLOSED_AT, label: 'P1' },
        },
        reopenedFor: ['back'],
      });
      glResp('a', { classId: 'p1' });
      glResp('blank', { classId: 'p1', answers: [] });
      glResp('back', { classId: 'p1' });
      const r = await turnInMarker(
        db as never,
        {
          kind: 'guidedLearning',
          scope: 'class',
          sessionId: 'g1',
          classKey: 'p1',
          closedAt: CLOSED_AT,
        },
        NOW,
        CLOSED_AT
      );
      expect(r.turnedIn).toBe(1);
      expect(turnedIn()).toEqual(['a']);
    });
  });

  describe('video single line', () => {
    const A = 'users/t1/video_activity_assignments/v1';
    const vaResp = (id: string, extra: Doc) =>
      store.docs.set(`${V}/responses/${id}`, {
        studentUid: id,
        completedAt: null,
        answers: [{ questionId: 'q1' }],
        ...extra,
      });

    it('queues a close mark with the preview and turns in all but let-in students', async () => {
      store.docs.set(V, {
        teacherUid: 't1',
        status: 'ended',
        studentAccess: { pass: NOW + 60_000 },
      });
      store.docs.set(A, { closedAt: CLOSED_AT });
      expect(
        await queueVideoRunTurnIn(
          db as never,
          'v1',
          {},
          { closedAt: CLOSED_AT },
          CLOSED_AT,
          no
        )
      ).toBe(false);
      expect(
        await queueVideoRunTurnIn(
          db as never,
          'v1',
          {},
          { closedAt: CLOSED_AT },
          CLOSED_AT,
          yes
        )
      ).toBe(true);
      vaResp('a', {});
      vaResp('pass', {});
      vaResp('blank', { answers: [] });
      const r = await runVideoClassTurnIns(db as never, NOW);
      expect(r).toMatchObject({ turnedIn: 1, requeued: 1 });
      expect(turnedIn()).toEqual(['a']);
    });

    it('leaves per-class, live and view-only runs to their own paths', async () => {
      store.docs.set(V, {
        teacherUid: 't1',
        periodAccess: { p1: { state: 'closed' } },
      });
      expect(
        await queueVideoRunTurnIn(
          db as never,
          'v1',
          {},
          { closedAt: 1 },
          1,
          yes
        )
      ).toBe(false);
      store.docs.set(V, { teacherUid: 't1', sessionMode: 'teacher' });
      expect(
        await queueVideoRunTurnIn(
          db as never,
          'v1',
          {},
          { closedAt: 1 },
          1,
          yes
        )
      ).toBe(false);
      store.docs.set(V, { teacherUid: 't1' });
      expect(
        await queueVideoRunTurnIn(
          db as never,
          'v1',
          {},
          { closedAt: 1, mode: 'view-only' },
          1,
          yes
        )
      ).toBe(false);
    });

    it('is stale once Undo or Reopen clears the close mark', async () => {
      store.docs.set(V, { teacherUid: 't1' });
      store.docs.set(A, { closedAt: null });
      vaResp('a', {});
      const r = await turnInMarker(
        db as never,
        {
          kind: 'videoActivity',
          scope: 'run',
          sessionId: 'v1',
          classKey: '',
          closedAt: CLOSED_AT,
        },
        NOW
      );
      expect(r.outcome).toBe('stale');
    });
  });
});
