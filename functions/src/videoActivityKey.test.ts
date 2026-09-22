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
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/logger', () => ({ info: vi.fn() }));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  handleCheckVideoActivityAnswer,
  scrubVideoActivitySessionKey,
} from './videoActivityKey';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleCheckVideoActivityAnswer>[0];

function makeDb(docs: Record<string, Doc>) {
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
    delete: () => {
      delete docs[path];
      return Promise.resolve();
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        get: () =>
          Promise.resolve({
            empty: !Object.entries(docs).some(
              ([p, d]) =>
                p.startsWith(`${path}/`) &&
                !p.slice(path.length + 1).includes('/') &&
                d[field] === value
            ),
          }),
      }),
    }),
  });
  return {
    collection: (c: string) => collectionRef(c),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (ref: { path: string }, data: Doc) =>
          ops.push(() => (docs[ref.path] = data)),
        update: (ref: { path: string }, data: Doc) =>
          ops.push(() => (docs[ref.path] = { ...docs[ref.path], ...data })),
        commit: () => {
          ops.forEach((op) => op());
          return Promise.resolve();
        },
      };
    },
  } as unknown as Db;
}

const SESSION = 'video_activity_sessions/s1';
const KEY = `${SESSION}/key/answers`;
const KEYED = [
  {
    id: 'q1',
    type: 'MC',
    text: 'Capital?',
    timestamp: 5,
    correctAnswer: 'Paris',
    incorrectAnswers: ['Rome'],
  },
];
const input = (answer: string) => ({
  sessionId: 's1',
  questionId: 'q1',
  answer,
});

describe('handleCheckVideoActivityAnswer', () => {
  it('grades a joined student against the key doc', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: [] },
      [KEY]: { questions: KEYED },
      [`${SESSION}/responses/pin-p1-01`]: { studentUid: 'stu' },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input('paris'))
    ).resolves.toEqual({ isCorrect: true, correctAnswer: 'Paris' });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stu', input('Rome'))
    ).resolves.toEqual({ isCorrect: false, correctAnswer: 'Paris' });
  });

  it('refuses a caller who has not joined', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: [] },
      [KEY]: { questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 'stranger', input('Paris'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleCheckVideoActivityAnswer(db, null, input('Paris'))
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('lets the owning teacher and view-only viewers check', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: [] },
      [KEY]: { questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', input('Paris'))
    ).resolves.toMatchObject({ isCorrect: true });
    const viewOnly = makeDb({
      [SESSION]: { teacherUid: 't1', mode: 'view-only', questions: [] },
      [KEY]: { questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(viewOnly, 'anyone', input('Paris'))
    ).resolves.toMatchObject({ isCorrect: true });
  });

  it('falls back to a legacy embedded key', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', input('Paris'))
    ).resolves.toMatchObject({ isCorrect: true });
  });

  it('rejects unknown questions and malformed input', async () => {
    const db = makeDb({
      [SESSION]: { teacherUid: 't1', questions: [] },
      [KEY]: { questions: KEYED },
    });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', {
        ...input('x'),
        questionId: 'nope',
      })
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', {
        ...input('x'),
        sessionId: 'a/b',
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      handleCheckVideoActivityAnswer(db, 't1', input('x'.repeat(2001)))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('scrubVideoActivitySessionKey', () => {
  it('moves an embedded key off the session doc', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: { teacherUid: 't1', questions: KEYED },
    };
    const db = makeDb(docs);
    await expect(
      scrubVideoActivitySessionKey(db, 's1', docs[SESSION])
    ).resolves.toBe('scrubbed');
    expect(docs[KEY]).toEqual({ questions: KEYED });
    expect(docs[SESSION].questions).toEqual([]);
    expect(JSON.stringify(docs[SESSION])).not.toContain('correctAnswer');
    expect(docs[SESSION].publicQuestions).toEqual([
      expect.objectContaining({ id: 'q1', text: 'Capital?', timestamp: 5 }),
    ]);
  });

  it('leaves an already-split session alone', async () => {
    const docs: Record<string, Doc> = {
      [SESSION]: { questions: [], publicQuestions: [{ id: 'q1' }] },
    };
    await expect(
      scrubVideoActivitySessionKey(makeDb(docs), 's1', docs[SESSION])
    ).resolves.toBe('clean');
    expect(docs[KEY]).toBeUndefined();
  });

  it('deletes the key doc with its session', async () => {
    const docs: Record<string, Doc> = { [KEY]: { questions: KEYED } };
    await expect(
      scrubVideoActivitySessionKey(makeDb(docs), 's1', null)
    ).resolves.toBe('deleted');
    expect(docs[KEY]).toBeUndefined();
  });
});
