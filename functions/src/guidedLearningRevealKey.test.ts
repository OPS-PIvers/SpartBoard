import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('./functionsInit', () => ({}));

import { applyLateRevealKey } from './guidedLearningRevealKey';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof applyLateRevealKey>[0];

function makeDb(docs: Record<string, Doc>) {
  const docRef = (path: string): Doc => ({
    get: () => Promise.resolve({ data: () => docs[path] }),
    update: (data: Doc) => {
      docs[path] = { ...docs[path], ...data };
      return Promise.resolve();
    },
    collection: (sub: string) => ({
      doc: (id: string) => docRef(`${path}/${sub}/${id}`),
    }),
  });
  return {
    collection: (c: string) => ({ doc: (id: string) => docRef(`${c}/${id}`) }),
  } as unknown as Db;
}

const SESSION = 'guided_learning_sessions/s1';
const RESPONSE = `${SESSION}/responses/u1`;
const ASSIGNMENT = 'users/t1/guided_learning_assignments/s1';
const KEY = { s0: 'a' };

function world(over: { session?: Doc; assignment?: Doc } = {}) {
  return {
    [SESSION]: {
      teacherUid: 't1',
      scoreVisibility: 'score-responses-and-answers',
      ...over.session,
    },
    [ASSIGNMENT]: {
      scoreVisibility: 'score-responses-and-answers',
      revealedAnswers: KEY,
      lateRevealIds: ['u1'],
      ...over.assignment,
    },
    [RESPONSE]: { completedAt: 5, answers: [] },
  } as Record<string, Doc>;
}

const turnIn = (docs: Record<string, Doc>, before: Doc | undefined = {}) =>
  applyLateRevealKey(makeDb(docs), 's1', 'u1', before, docs[RESPONSE]);

describe('applyLateRevealKey', () => {
  it('gives a late submitter the key while the class sees answers', async () => {
    const docs = world();
    await expect(turnIn(docs)).resolves.toBe(true);
    expect(docs[RESPONSE].revealedAnswers).toEqual(KEY);
    expect(docs[SESSION]).not.toHaveProperty('revealedAnswers');
  });

  it('does nothing below the answers level or after unpublish', async () => {
    for (const docs of [
      world({ session: { scoreVisibility: 'score-and-responses' } }),
      world({ session: { scoreVisibility: undefined } }),
      world({ assignment: { revealedAnswers: undefined } }),
    ]) {
      await expect(turnIn(docs)).resolves.toBe(false);
      expect(docs[RESPONSE]).not.toHaveProperty('revealedAnswers');
    }
  });

  it('withholds the key from a response not started before the publish', async () => {
    for (const docs of [
      world({ assignment: { lateRevealIds: ['someone-else'] } }),
      world({ assignment: { lateRevealIds: undefined } }),
    ]) {
      await expect(turnIn(docs)).resolves.toBe(false);
      expect(docs[RESPONSE]).not.toHaveProperty('revealedAnswers');
    }
  });

  it('ignores writes that are not a turn-in', async () => {
    const docs = world();
    await expect(turnIn(docs, { completedAt: 4 })).resolves.toBe(false);
    docs[RESPONSE] = { completedAt: null, answers: [] };
    await expect(turnIn(docs)).resolves.toBe(false);
    docs[RESPONSE] = { completedAt: 5, revealedAnswers: { s0: 'x' } };
    await expect(turnIn(docs)).resolves.toBe(false);
    expect(docs[RESPONSE].revealedAnswers).toEqual({ s0: 'x' });
  });
});
