import { describe, it, expect, vi, beforeEach } from 'vitest';

type Doc = Record<string, unknown>;
interface Store {
  docs: Record<string, Doc | undefined>;
  updates: Array<[string, Doc]>;
  onQuery?: () => void;
}

const store = vi.hoisted<Store>(() => ({ docs: {}, updates: [] }));

vi.mock('@/config/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => {
  interface Snap {
    id: string;
    exists: () => boolean;
    data: () => Doc | undefined;
  }
  const snap = (path: string): Snap => ({
    id: path.split('/').pop() ?? '',
    exists: () => store.docs[path] !== undefined,
    data: () => store.docs[path],
  });
  return {
    doc: (base: unknown, ...segs: string[]) =>
      typeof base === 'string' ? [base, ...segs].join('/') : segs.join('/'),
    collection: (base: string, name: string) => `${base}/${name}`,
    getDoc: (path: string) => Promise.resolve(snap(path)),
    getDocs: (coll: string) => {
      store.onQuery?.();
      const prefix = `${coll}/`;
      const docs = Object.keys(store.docs)
        .filter(
          (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')
        )
        .map((p) => ({ ...snap(p), ref: p }));
      return Promise.resolve({ docs });
    },
    runTransaction: (
      _db: unknown,
      fn: (tx: {
        get: (p: string) => Promise<Snap>;
        update: (p: string, d: Doc) => void;
      }) => Promise<void>
    ) =>
      fn({
        get: (p) => Promise.resolve(snap(p)),
        update: (p, d) => {
          store.updates.push([p, d]);
        },
      }),
  };
});

import {
  finalizeClassGuidedLearningResponses,
  finalizeOpenGuidedLearningResponses,
} from './glTurnIn';

const NOW = 1_700_000_000_000;
const S = 'guided_learning_sessions/s1';
const CLOSED_AT = 5;

const respond = (id: string, extra: Doc = {}) => {
  store.docs[`${S}/responses/${id}`] = {
    studentAnonymousId: id,
    answers: [{ stepId: 's1', answer: 'x', isCorrect: null }],
    completedAt: null,
    ...extra,
  };
};
const turnedIn = () => store.updates.map(([p]) => p.split('/').pop()).sort();

beforeEach(() => {
  store.docs = {};
  store.updates = [];
  store.onQuery = undefined;
});

describe('finalizeClassGuidedLearningResponses', () => {
  const session = (p1: Doc, extra: Doc = {}) => ({
    periodAccess: { p1: { label: 'P1', ...p1 }, p2: { state: 'open' } },
    ...extra,
  });

  it("turns in the closed class's unfinished rows, PIN joiners by label included", async () => {
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT });
    respond('a', { classId: 'p1' });
    respond('pin', { classPeriod: 'P1' });
    respond('done', { classId: 'p1', completedAt: 3 });
    respond('b', { classId: 'p2' });
    respond('otherPin', { classPeriod: 'P2' });

    await finalizeClassGuidedLearningResponses('s1', 'p1', CLOSED_AT, NOW);

    expect(turnedIn()).toEqual(['a', 'pin']);
    expect(store.updates[0][1]).toEqual({ completedAt: NOW });
  });

  it('turns in a row with no completedAt field at all', async () => {
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT });
    store.docs[`${S}/responses/legacy`] = {
      classId: 'p1',
      answers: [{ stepId: 's1', answer: 'x', isCorrect: null }],
    };
    await finalizeClassGuidedLearningResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(turnedIn()).toEqual(['legacy']);
  });

  it('leaves a blank join Not started', async () => {
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT });
    respond('blank', { classId: 'p1', answers: [] });
    respond('a', { classId: 'p1' });
    await finalizeClassGuidedLearningResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(turnedIn()).toEqual(['a']);
  });

  it('skips students let in or reopened for', async () => {
    store.docs[S] = session(
      { state: 'closed', closedAt: CLOSED_AT },
      { studentAccess: { let: NOW + 1000, gone: NOW - 1 }, reopenedFor: ['re'] }
    );
    respond('let', { classId: 'p1' });
    respond('gone', { classId: 'p1' });
    respond('re', { classId: 'p1' });
    await finalizeClassGuidedLearningResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(turnedIn()).toEqual(['gone']);
  });

  it.each([
    ['reopened', { state: 'open', closedAt: null }],
    ['closed again later', { state: 'closed', closedAt: CLOSED_AT + 1 }],
    ['paused', { state: 'paused', closedAt: CLOSED_AT }],
  ])('does nothing once the class was %s', async (_name, p1) => {
    store.docs[S] = session(p1);
    respond('a', { classId: 'p1' });
    await finalizeClassGuidedLearningResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(store.updates).toHaveLength(0);
  });

  it('skips rows once a Reopen lands while the turn-in runs', async () => {
    store.docs[S] = session({ state: 'closed', closedAt: CLOSED_AT });
    respond('a', { classId: 'p1' });
    store.onQuery = () => {
      store.docs[S] = session({ state: 'open', closedAt: null });
    };
    await finalizeClassGuidedLearningResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(store.updates).toHaveLength(0);
  });

  it('does nothing when the session is gone', async () => {
    respond('a', { classId: 'p1' });
    await finalizeClassGuidedLearningResponses('s1', 'p1', CLOSED_AT, NOW);
    expect(store.updates).toHaveLength(0);
  });
});

describe('finalizeOpenGuidedLearningResponses', () => {
  it('turns in every unfinished row while the End close stands', async () => {
    store.docs[S] = { closeAt: CLOSED_AT };
    respond('a', { classId: 'p1' });
    respond('b');
    respond('done', { completedAt: 2 });
    await finalizeOpenGuidedLearningResponses('s1', CLOSED_AT, NOW);
    expect(turnedIn()).toEqual(['a', 'b']);
  });

  it.each([
    ['reopened', null],
    ['closed at another time', CLOSED_AT + 1],
  ])('does nothing once the run was %s', async (_name, closeAt) => {
    store.docs[S] = { closeAt };
    respond('a');
    await finalizeOpenGuidedLearningResponses('s1', CLOSED_AT, NOW);
    expect(store.updates).toHaveLength(0);
  });
});
