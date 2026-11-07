import { describe, it, expect, vi, beforeEach } from 'vitest';

type Doc = Record<string, unknown>;
interface Store {
  docs: Record<string, Doc | undefined>;
  updates: Array<[string, Doc]>;
  queries: unknown[];
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
        .filter((p) =>
          ['joined', 'in-progress'].includes(String(store.docs[p]?.status))
        )
        .map((p) => ({ ref: p, data: () => store.docs[p] }));
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

import { finalizeOpenQuizResponses } from '@/utils/quizFinalizeOpenResponses';

const NOW = 1_700_000_000_000;
const S = 'quiz_sessions/s1';

beforeEach(() => {
  store.docs = {};
  store.updates = [];
  store.queries = [];
});

describe('finalizeOpenQuizResponses', () => {
  it('turns in joined and in-progress rows, including frozen and held ones, and leaves completed rows alone', async () => {
    store.docs[S] = {
      status: 'ended',
      completenessModel: 1,
      publicQuestions: [{ id: 'q1' }, { id: 'q2' }],
    };
    store.docs[`${S}/responses/held`] = {
      status: 'in-progress',
      partHeld: true,
      answers: [{ questionId: 'q1', status: 'draft', answer: 'a' }],
    };
    store.docs[`${S}/responses/scanFirst`] = {
      status: 'joined',
      answers: [{ questionId: 'q2', status: 'submitted', answer: 'b' }],
    };
    store.docs[`${S}/responses/done`] = { status: 'completed', answers: [] };

    await finalizeOpenQuizResponses('s1', NOW);

    const byId: Record<string, Doc> = Object.fromEntries(
      store.updates.map(([p, d]) => [p.split('/').pop(), d])
    );
    expect(Object.keys(byId).sort()).toEqual(['held', 'scanFirst']);
    expect(byId.held).toMatchObject({
      status: 'completed',
      submittedAt: NOW,
      unlocked: false,
      completedAttempts: 1,
    });
    expect(byId.held.answers).toEqual([
      { questionId: 'q1', status: 'submitted', answer: 'a' },
      expect.objectContaining({ questionId: 'q2', unresponded: 'abandoned' }),
    ]);
    expect(byId.scanFirst).toMatchObject({ status: 'completed' });
  });

  it('reads the question list from the content doc on a per-period session', async () => {
    store.docs[S] = {
      status: 'ended',
      completenessModel: 1,
      questionsInContent: true,
    };
    store.docs[`${S}/content/questions`] = { publicQuestions: [{ id: 'q9' }] };
    store.docs[`${S}/responses/r1`] = { status: 'joined', answers: [] };

    await finalizeOpenQuizResponses('s1', NOW);

    expect(store.updates).toHaveLength(1);
    expect(store.updates[0][1].answers).toEqual([
      expect.objectContaining({ questionId: 'q9', unresponded: 'abandoned' }),
    ]);
    expect(store.updates[0][1]).not.toHaveProperty('completedAttempts');
  });

  it('leaves a scanned written-answers row the student never opened', async () => {
    store.docs[S] = { status: 'ended', publicQuestions: [{ id: 'q1' }] };
    store.docs[`${S}/responses/scan`] = {
      status: 'joined',
      paperWrittenBatchId: 'b1',
      answers: [{ questionId: 'q1', status: 'submitted', answer: 'x' }],
    };
    store.docs[`${S}/responses/joinedOnDevice`] = {
      status: 'joined',
      paperWrittenBatchId: 'b1',
      lastWriteAt: { seconds: 1 },
      answers: [],
    };

    await finalizeOpenQuizResponses('s1', NOW);

    expect(store.updates.map(([p]) => p.split('/').pop())).toEqual([
      'joinedOnDevice',
    ]);
  });

  it('does nothing when the teacher reopened before the turn-in ran', async () => {
    store.docs[S] = { status: 'paused', publicQuestions: [{ id: 'q1' }] };
    store.docs[`${S}/responses/r1`] = { status: 'in-progress', answers: [] };
    await finalizeOpenQuizResponses('s1', NOW);
    expect(store.updates).toHaveLength(0);
  });

  it('does nothing when the session is gone', async () => {
    store.docs[`${S}/responses/r1`] = { status: 'joined', answers: [] };
    await finalizeOpenQuizResponses('s1', NOW);
    expect(store.updates).toHaveLength(0);
    expect(store.queries).toHaveLength(0);
  });
});
