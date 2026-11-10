import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: vi.fn() }));
const granted = vi.fn(() => Promise.resolve(true));
vi.mock('./quizMediaArchive', () => ({ isGlobalFeatureGranted: granted }));

import { checkGrader } from './flashcardCheck';
import {
  handleRescoreFlashcardCheck,
  rescoredSubmission,
} from './flashcardRescore';

type Doc = Record<string, unknown>;
const card = (id: string, term: string, definition: string) => ({
  id,
  term,
  definition,
});
const fixedCards = [card('a', 'respeto', 'respect'), card('b', 'perro', 'dog')];
const grader = checkGrader({
  lockedSettings: { showFirst: 'definition' },
  termLanguage: 'es-US',
  definitionLanguage: 'en-US',
});

describe('rescoredSubmission', () => {
  it('re-grades typed answers against the fixed card', () => {
    const next = rescoredSubmission(
      {
        submittedAt: 1,
        answerLog: [
          { cardId: 'a', response: 'respeto', correct: false },
          { cardId: 'b', response: 'perro', correct: true },
        ],
      },
      fixedCards,
      grader
    );
    expect(next?.score).toBe(2);
    expect(next?.answerLog[0]).toMatchObject({ correct: true });
  });

  it('never takes a multiple choice point away and keeps accepted flags', () => {
    const next = rescoredSubmission(
      {
        submittedAt: 1,
        answerLog: [
          { cardId: 'a', response: 'respecto', type: 'mc', correct: true },
          { cardId: 'b', response: 'gato', type: 'fib', correct: true },
        ],
        flags: [{ cardId: 'b', response: 'gato', accepted: true }],
      },
      fixedCards,
      grader
    );
    expect(next?.answerLog[0]).toMatchObject({ correct: true });
    expect(next?.answerLog[1]).toMatchObject({ correct: false });
    expect(next?.score).toBe(2);
  });

  it('leaves blanks, Speak verdicts, unknown cards and unsubmitted work alone', () => {
    const progress = {
      submittedAt: 1,
      answerLog: [
        { cardId: 'a', response: '', correct: false },
        {
          cardId: 'a',
          response: '',
          type: 'speak',
          passed: true,
          correct: true,
        },
        { cardId: 'gone', response: 'x', correct: true },
      ],
    };
    expect(rescoredSubmission(progress, fixedCards, grader)).toBeNull();
    expect(
      rescoredSubmission(
        { answerLog: [{ cardId: 'a', response: 'respeto', correct: false }] },
        fixedCards,
        grader
      )
    ).toBeNull();
  });
});

function makeDb(session: Doc, progress: Record<string, Doc>) {
  const updates: Array<[string, Doc, unknown]> = [];
  const db = {
    collection: () => ({
      doc: () => ({
        get: () => Promise.resolve({ exists: true, data: () => session }),
        collection: (sub: string) =>
          sub === 'content'
            ? {
                doc: () => ({
                  get: () => Promise.resolve({ get: () => fixedCards }),
                }),
              }
            : {
                where: () => ({
                  get: () =>
                    Promise.resolve({
                      docs: Object.entries(progress).map(([id, data]) => ({
                        data: () => data,
                        updateTime: `t-${id}`,
                        ref: {
                          update: (d: Doc, pre: unknown) => {
                            updates.push([id, d, pre]);
                            return Promise.resolve();
                          },
                        },
                      })),
                    }),
                }),
              },
      }),
    }),
  } as unknown as Parameters<typeof handleRescoreFlashcardCheck>[0];
  return { db, updates };
}

const teacher = { uid: 't1', email: 't1@x.org', studentRole: false };
const writeCheck = {
  teacherUid: 't1',
  kind: 'check',
  checkMode: 'write',
  status: 'active',
  lockedSettings: { showFirst: 'definition' },
  termLanguage: 'es-US',
  definitionLanguage: 'en-US',
  cards: fixedCards,
};

describe('handleRescoreFlashcardCheck', () => {
  it('updates only submissions whose score moves, guarded on the read', async () => {
    const { db, updates } = makeDb(writeCheck, {
      s1: {
        submittedAt: 1,
        answerLog: [{ cardId: 'a', response: 'respeto', correct: false }],
      },
      s2: {
        submittedAt: 1,
        answerLog: [{ cardId: 'b', response: 'perro', correct: true }],
      },
    });
    await expect(
      handleRescoreFlashcardCheck(db, teacher, { assignmentId: 'a1' })
    ).resolves.toEqual({ rescored: 1 });
    expect(updates).toEqual([
      [
        's1',
        {
          answerLog: [{ cardId: 'a', response: 'respeto', correct: true }],
          score: 1,
        },
        { lastUpdateTime: 't-s1' },
      ],
    ]);
  });

  it('refuses students, other teachers, and teachers without the flag', async () => {
    const { db } = makeDb(writeCheck, {});
    await expect(
      handleRescoreFlashcardCheck(
        db,
        { ...teacher, studentRole: true },
        { assignmentId: 'a1' }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleRescoreFlashcardCheck(
        db,
        { ...teacher, uid: 'other' },
        { assignmentId: 'a1' }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    granted.mockResolvedValueOnce(false);
    await expect(
      handleRescoreFlashcardCheck(db, teacher, { assignmentId: 'a1' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('skips Flashcards and Speak Checks', async () => {
    const { db, updates } = makeDb(
      { ...writeCheck, checkMode: 'speak' },
      {
        s1: {
          submittedAt: 1,
          answerLog: [{ cardId: 'a', response: 'respeto', correct: false }],
        },
      }
    );
    await expect(
      handleRescoreFlashcardCheck(db, teacher, { assignmentId: 'a1' })
    ).resolves.toEqual({ rescored: 0 });
    expect(updates).toEqual([]);
  });
});
