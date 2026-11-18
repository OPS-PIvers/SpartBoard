import { describe, it, expect, vi, beforeEach } from 'vitest';

type Doc = Record<string, unknown>;
interface Store {
  docs: Record<string, Doc | undefined>;
  updates: Array<[string, Doc]>;
  queries: unknown[];
  /** Runs inside each transaction, before its reads. */
  onTx?: () => void;
}

const store = vi.hoisted<Store>(() => ({ docs: {}, updates: [], queries: [] }));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => {
  interface Snap {
    exists: () => boolean;
    data: () => Doc | undefined;
  }
  const snap = (path: string): Snap => ({
    exists: () => store.docs[path] !== undefined,
    data: () => store.docs[path],
  });
  return {
    doc: (base: unknown, ...segs: string[]) =>
      typeof base === 'string' ? [base, ...segs].join('/') : segs.join('/'),
    collection: (base: string, name: string) => `${base}/${name}`,
    where: (...args: unknown[]) => ({ where: args }),
    query: (coll: string, ...filters: unknown[]) => ({ coll, filters }),
    getDoc: (path: string) => Promise.resolve(snap(path)),
    getDocs: (q: { coll: string; filters: unknown[] }) => {
      store.queries.push(q);
      const prefix = `${q.coll}/`;
      const docs = Object.keys(store.docs)
        .filter(
          (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')
        )
        .filter((p) => store.docs[p]?.completedAt === null)
        .map((p) => ({ ref: p, data: () => store.docs[p] }));
      return Promise.resolve({ docs });
    },
    runTransaction: (
      _db: unknown,
      fn: (tx: {
        get: (p: string) => Promise<Snap>;
        update: (p: string, d: Doc) => void;
      }) => Promise<void>
    ) => {
      store.onTx?.();
      return fn({
        get: (p) => Promise.resolve(snap(p)),
        update: (p, d) => {
          store.updates.push([p, d]);
        },
      });
    },
  };
});

import { finalizeClassVideoResponses } from './videoClassTurnIn';

const NOW = 1_700_000_000_000;
const CLOSED_AT = 5;
const S = 'video_activity_sessions/s1';

const session = (p1: Doc, extra: Doc = {}) => ({
  status: 'active',
  periodAccess: { p1: { label: 'P1', ...p1 }, p2: { state: 'open' } },
  ...extra,
});
const open = (id: string, extra: Doc) => {
  store.docs[`${S}/responses/${id}`] = {
    studentUid: id,
    completedAt: null,
    completedAttempts: 0,
    answers: [{ questionId: 'q1', answer: 'a' }],
    ...extra,
  };
};
const turnedIn = () => store.updates.map(([p]) => p.split('/').pop()).sort();

beforeEach(() => {
  store.docs = {};
  store.updates = [];
  store.queries = [];
  store.onTx = undefined;
});

describe('finalizeClassVideoResponses', () => {
  it("turns in the closed class's unfinished attempts, PIN joiners by its label included", async () => {
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT });
    open('a', { classId: 'p1', completedAttempts: 1 });
    open('pin', { classPeriod: 'P1' });
    open('b', { classId: 'p2' });
    open('otherPin', { classPeriod: 'P2' });
    store.docs[`${S}/responses/done`] = {
      studentUid: 'done',
      classId: 'p1',
      completedAt: 3,
      answers: [{ questionId: 'q1' }],
    };
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(turnedIn()).toEqual(['a', 'pin']);
    const byId = new Map<string, Doc>(
      store.updates.map(([p, d]): [string, Doc] => [
        p.split('/').pop() ?? '',
        d,
      ])
    );
    expect(byId.get('a')).toEqual({ completedAt: NOW, completedAttempts: 2 });
    expect(byId.get('pin')).toEqual({ completedAt: NOW, completedAttempts: 1 });
  });

  it('leaves blank joins, let-in, reopened-for and unlocked students open', async () => {
    store.docs[S] = session(
      { state: 'closed', closedAt: CLOSED_AT },
      {
        studentAccess: { pass: NOW + 1, expired: NOW - 1 },
        reopenedFor: ['picked'],
      }
    );
    for (const id of ['pass', 'expired', 'picked', 'plain'])
      open(id, { classId: 'p1' });
    open('unlocked', { classId: 'p1', unlocked: true });
    open('blank', { classId: 'p1', answers: [] });
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(turnedIn()).toEqual(['expired', 'plain']);
  });

  it('does nothing once the class was reopened, is only Ready, or was closed again later', async () => {
    open('a', { classId: 'p1' });
    store.docs[S] = session({ state: 'open', closedAt: null });
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    store.docs[S] = session({ state: 'closed' });
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT + 100 });
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(store.updates).toHaveLength(0);
    expect(store.queries).toHaveLength(0);
  });

  it('skips rows once the class reopens while the turn-in runs', async () => {
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT });
    open('a', { classId: 'p1' });
    open('b', { classId: 'p1' });
    store.onTx = () => {
      store.docs[S] = session({ state: 'open', closedAt: null });
    };
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(store.updates).toHaveLength(0);
  });

  it('leaves an attempt the student finished, or the teacher unlocked, after the list was read', async () => {
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT });
    open('finished', { classId: 'p1' });
    open('unlockedLate', { classId: 'p1' });
    store.onTx = () => {
      store.docs[`${S}/responses/finished`] = {
        ...store.docs[`${S}/responses/finished`],
        completedAt: 4,
      };
      store.docs[`${S}/responses/unlockedLate`] = {
        ...store.docs[`${S}/responses/unlockedLate`],
        unlocked: true,
      };
    };
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(store.updates).toHaveLength(0);
  });

  it('queries only unfinished attempts and ignores a missing session', async () => {
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(store.queries).toHaveLength(0);
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT });
    await finalizeClassVideoResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(store.queries).toEqual([
      {
        coll: `${S}/responses`,
        filters: [{ where: ['completedAt', '==', null] }],
      },
    ]);
  });
});
