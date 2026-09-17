// Unit tests for teacher flag review on Flashcards Check (docs/plans/FLASHCARDS.md §7).
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
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

import {
  handleResolveFlashcardFlag,
  type FlashcardFlagCaller,
} from './flashcardFlags';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleResolveFlashcardFlag>[0];

function makeDb(docs: Record<string, Doc>) {
  const refFor = (path: string) => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
    set: (data: Doc, opts?: { merge?: boolean }) => {
      docs[path] = opts?.merge ? { ...(docs[path] ?? {}), ...data } : data;
    },
  });
  const docRef = (path: string) => ({
    ...refFor(path),
    collection: (sub: string) => ({
      doc: (id: string) => docRef(`${path}/${sub}/${id}`),
    }),
  });
  return {
    collection: (c: string) => ({ doc: (id: string) => docRef(`${c}/${id}`) }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: ReturnType<typeof refFor>) => ref.get(),
        set: (
          ref: ReturnType<typeof refFor>,
          d: Doc,
          o?: { merge?: boolean }
        ) => ref.set(d, o),
      }),
  } as unknown as Db;
}

const SESSION_PATH = 'flashcard_sessions/a1';
const PROGRESS_PATH = `${SESSION_PATH}/progress/student-1`;

const teacher: FlashcardFlagCaller = { uid: 'teacher-1', studentRole: false };

const input = (over: Doc = {}): Doc => ({
  assignmentId: 'a1',
  studentUid: 'student-1',
  cardId: 'c2',
  accept: true,
  ...over,
});

function docs(progressOver: Doc = {}, sessionOver: Doc = {}) {
  return {
    [SESSION_PATH]: { teacherUid: 'teacher-1', kind: 'check', ...sessionOver },
    [PROGRESS_PATH]: {
      submittedAt: 1,
      score: 2,
      total: 3,
      answerLog: [
        { cardId: 'c1', response: 'dog', correct: true },
        { cardId: 'c2', response: 'cancion', correct: false },
        { cardId: 'c3', response: 'cat', correct: true },
      ],
      flags: [{ cardId: 'c2', response: 'cancion' }],
      ...progressOver,
    },
  };
}

describe('handleResolveFlashcardFlag', () => {
  it('accepting a flag raises the score and marks the flag', async () => {
    const store = docs();
    const db = makeDb(store);
    const result = await handleResolveFlashcardFlag(db, teacher, input());
    expect(result).toEqual({ score: 3, total: 3 });
    expect(store[PROGRESS_PATH].score).toBe(3);
    expect(store[PROGRESS_PATH].flags).toEqual([
      { cardId: 'c2', response: 'cancion', accepted: true },
    ]);
  });

  it('dismissing a previously accepted flag lowers the score again', async () => {
    const store = docs({
      score: 3,
      flags: [{ cardId: 'c2', response: 'cancion', accepted: true }],
    });
    const db = makeDb(store);
    const result = await handleResolveFlashcardFlag(
      db,
      teacher,
      input({ accept: false })
    );
    expect(result.score).toBe(2);
    expect(store[PROGRESS_PATH].flags).toEqual([
      { cardId: 'c2', response: 'cancion', accepted: false },
    ]);
  });

  it('rejects a teacher who does not own the session', async () => {
    const db = makeDb(docs({}, { teacherUid: 'someone-else' }));
    await expect(
      handleResolveFlashcardFlag(db, teacher, input())
    ).rejects.toThrow(/Not your assignment/);
  });

  it('rejects a student caller', async () => {
    const db = makeDb(docs());
    await expect(
      handleResolveFlashcardFlag(
        db,
        { uid: 'student-1', studentRole: true },
        input()
      )
    ).rejects.toThrow(/Teacher sign-in required/);
  });

  it('rejects a card with no flag on it', async () => {
    const db = makeDb(docs());
    await expect(
      handleResolveFlashcardFlag(db, teacher, input({ cardId: 'c1' }))
    ).rejects.toThrow(/No flag for that card/);
  });

  it('rejects an unsubmitted progress doc', async () => {
    const db = makeDb(docs({ submittedAt: undefined }));
    await expect(
      handleResolveFlashcardFlag(db, teacher, input())
    ).rejects.toThrow(/Nothing submitted yet/);
  });
});
