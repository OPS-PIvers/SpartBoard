// The Schoology import inbox: token and flag checks, payload validation and what gets stored.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  storage: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: (_o: unknown, h: unknown) => h,
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./glTours', () => ({
  GL_TOURS_COLLECTION: 'building_guided_learning_tours',
}));

import { ExtensionCallError } from './webTourExtension';
import {
  INBOX_TTL_MS,
  MAX_INBOX_ITEMS,
  MAX_QUESTIONS,
  checkImporter,
  inboxDoc,
  parseInboxPayload,
  receiveQuiz,
  type Importer,
  type ImporterDeps,
  type InboxStore,
} from './schoologyQuizImport';

const CLIENT = 'client-123.apps.googleusercontent.com';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PIC = 'https://orono.schoology.com/file_download/abc';

const deps = (over: Partial<ImporterDeps> = {}): ImporterDeps => ({
  clientId: CLIENT,
  tokenInfo: () =>
    Promise.resolve({
      aud: CLIENT,
      azp: CLIENT,
      email: 'Teacher@orono.k12.mn.us',
      email_verified: 'true',
      expires_in: '3000',
    }),
  uidForEmail: () => Promise.resolve('uid-1'),
  allowed: () => Promise.resolve(true),
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  source: {
    kind: 'testQuiz',
    itemId: '8629405092',
    sectionId: '7595131723',
    url: 'https://orono.schoology.com/assignment/8629405092',
  },
  folderPath: ['Model Course: Hour 1'],
  quiz: {
    title: 'Sample Test/Quiz',
    warnings: [],
    questions: [
      {
        number: 1,
        text: 'Pick one',
        type: 'MC',
        options: [
          { letter: 'A', text: 'Yes' },
          { letter: 'B', text: 'No' },
        ],
        correctAnswer: 'A',
        imageIds: [PIC],
        warnings: [],
        points: 2,
        extra: 'dropped',
      },
    ],
    images: [],
  },
  unsupported: [],
  settings: { shuffleQuestions: true, attempts: 2 },
  pictures: [{ id: PIC, mime: 'image/png', data: PNG.toString('base64') }],
  ...over,
});

const status = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ExtensionCallError);
    return (e as ExtensionCallError).status;
  }
  return 200;
};
const statusOf = (fn: () => unknown) => status(Promise.resolve().then(fn));

describe('checkImporter', () => {
  it('returns the lowercased email, uid and flag', async () => {
    expect(await checkImporter('t', deps())).toEqual({
      email: 'teacher@orono.k12.mn.us',
      uid: 'uid-1',
      enabled: true,
    });
  });

  it('reports a teacher without the flag instead of refusing', async () => {
    const d = deps({ allowed: () => Promise.resolve(false) });
    expect((await checkImporter('t', d)).enabled).toBe(false);
  });

  it('refuses another client, another domain and an unset listing', async () => {
    const info = (over: object) => () =>
      Promise.resolve({
        ...{
          aud: CLIENT,
          email: 'a@orono.k12.mn.us',
          email_verified: 'true',
          expires_in: '9',
        },
        ...over,
      });
    expect(
      await status(checkImporter('t', deps({ tokenInfo: info({ aud: 'x' }) })))
    ).toBe(401);
    expect(
      await status(
        checkImporter('t', deps({ tokenInfo: info({ email: 'a@gmail.com' }) }))
      )
    ).toBe(403);
    expect(await status(checkImporter('t', deps({ clientId: '' })))).toBe(503);
  });
});

describe('parseInboxPayload', () => {
  it('keeps known fields and drops the rest', () => {
    const p = parseInboxPayload(body());
    expect(p.title).toBe('Sample Test/Quiz');
    expect(p.questions[0]).not.toHaveProperty('extra');
    expect(p.questions[0].points).toBe(2);
    expect(p.settings).toEqual({ shuffleQuestions: true, attempts: 2 });
    expect(p.pictures[0].bytes.equals(PNG)).toBe(true);
    expect(p.pictures[0].name).toBe('Picture 1');
  });

  it('refuses a bad source, type, picture or empty quiz', async () => {
    const q = body().quiz;
    const cases = [
      body({ source: { kind: 'page', itemId: '1' } }),
      body({ source: { kind: 'testQuiz', itemId: '../x' } }),
      body({
        source: { kind: 'testQuiz', itemId: '1', url: 'https://evil.com/x' },
      }),
      body({
        quiz: { ...q, questions: [{ ...q.questions[0], type: 'Hotspot' }] },
      }),
      body({ quiz: { ...q, questions: [] } }),
      body({
        pictures: [
          { id: PIC, mime: 'image/svg+xml', data: PNG.toString('base64') },
        ],
      }),
      body({
        pictures: [
          { id: PIC, mime: 'image/jpeg', data: PNG.toString('base64') },
        ],
      }),
      body({ pictures: [{ id: PIC, mime: 'image/png', data: 'not base64!' }] }),
      body({ settings: { shuffleQuestions: 'yes' } }),
      body({ folderPath: ['  '] }),
    ];
    for (const c of cases)
      expect(await statusOf(() => parseInboxPayload(c))).toBe(400);
  });

  it('stores blank alternates as maps, since Firestore has no nested arrays', () => {
    const q = body().quiz;
    const fib = {
      ...q.questions[0],
      type: 'FIB',
      blankAlternates: [['a', 'b'], []],
    };
    const p = parseInboxPayload(body({ quiz: { ...q, questions: [fib] } }));
    expect(p.questions[0].blankAlternates).toEqual([
      { answers: ['a', 'b'] },
      { answers: [] },
    ]);
    const hasNested = (v: unknown): boolean =>
      Array.isArray(v)
        ? v.some((x) => Array.isArray(x) || hasNested(x))
        : !!v && typeof v === 'object' && Object.values(v).some(hasNested);
    expect(hasNested(inboxDoc(p, 'uid-1', 'testQuiz_1', 'send-1', 5))).toBe(
      false
    );
  });

  it('keeps a long dropdown, drops unholdable settings and inline picture ids', () => {
    const q = body().quiz;
    const options = Array.from({ length: 30 }, (_, i) => ({
      text: `Choice ${i}`,
    }));
    const p = parseInboxPayload(
      body({
        quiz: {
          ...q,
          questions: [
            {
              ...q.questions[0],
              options,
              imageIds: [`data:image/png;base64,${'A'.repeat(3000)}`],
            },
          ],
        },
        settings: { timeLimitMinutes: 5000, attempts: 2 },
        pictures: [],
      })
    );
    expect(p.questions[0].options).toHaveLength(30);
    expect(p.questions[0].imageIds).toEqual([]);
    expect(p.settings).toEqual({ attempts: 2 });
  });

  it('refuses too many questions with 413', async () => {
    const q = body().quiz;
    const many = body({
      quiz: {
        ...q,
        questions: Array.from(
          { length: MAX_QUESTIONS + 1 },
          () => q.questions[0]
        ),
      },
    });
    expect(await statusOf(() => parseInboxPayload(many))).toBe(413);
  });
});

describe('inboxDoc', () => {
  it('drops a picture that did not arrive and says so on the question', () => {
    const doc = inboxDoc(
      parseInboxPayload(body({ pictures: [] })),
      'uid-1',
      'testQuiz_1',
      'send-1',
      5
    );
    expect(doc.quiz.questions[0].imageIds).toEqual([]);
    expect(doc.quiz.questions[0].warnings[0]).toMatch(/couldn't be copied/);
  });

  it('stores pictures under the item prefix', () => {
    const doc = inboxDoc(
      parseInboxPayload(body()),
      'uid-1',
      'testQuiz_1',
      'send-1',
      5
    );
    expect(doc.images).toEqual([
      {
        id: PIC,
        path: 'schoology_import/uid-1/testQuiz_1/send-1/0',
        contentType: 'image/png',
        name: 'Picture 1',
      },
    ]);
  });

  it('measures the size cap in bytes, not characters', async () => {
    const q = body().quiz;
    const wide = { ...q.questions[0], text: '漢'.repeat(6000) };
    const payload = parseInboxPayload(
      body({
        quiz: { ...q, questions: Array.from({ length: 60 }, () => wide) },
      })
    );
    expect(
      await statusOf(() =>
        inboxDoc(payload, 'uid-1', 'testQuiz_1', 'send-1', 5)
      )
    ).toBe(413);
  });
});

describe('receiveQuiz', () => {
  const importer: Importer = {
    email: 'a@orono.k12.mn.us',
    uid: 'uid-1',
    enabled: true,
  };
  const memoryStore = (over: Partial<InboxStore> = {}) => {
    const calls: string[] = [];
    const store: InboxStore = {
      count: () => Promise.resolve(0),
      previousSend: () => Promise.resolve(null),
      clearPictures: (prefix) => (
        calls.push(`clear ${prefix}`),
        Promise.resolve()
      ),
      savePicture: (path) => (calls.push(`save ${path}`), Promise.resolve()),
      write: (uid, id, _doc, expireAt) => (
        calls.push(`write ${uid}/${id} ${expireAt}`),
        Promise.resolve()
      ),
      ...over,
    };
    return { store, calls };
  };

  it('replaces the item and its pictures, expiring in seven days', async () => {
    const { store, calls } = memoryStore();
    expect(await receiveQuiz(body(), importer, store, 1000, 'send-1')).toEqual({
      id: 'testQuiz_8629405092',
      questions: 1,
      pictures: 1,
    });
    expect(calls).toEqual([
      'save schoology_import/uid-1/testQuiz_8629405092/send-1/0',
      `write uid-1/testQuiz_8629405092 ${1000 + INBOX_TTL_MS}`,
    ]);
  });

  it('clears the replaced entry pictures only after the new entry is written', async () => {
    const { store, calls } = memoryStore({
      previousSend: () => Promise.resolve('old'),
    });
    await receiveQuiz(body(), importer, store, 1000, 'send-1');
    expect(calls.at(-1)).toBe(
      'clear schoology_import/uid-1/testQuiz_8629405092/old/'
    );
    const failing = memoryStore({
      previousSend: () => Promise.resolve('old'),
      write: () => Promise.reject(new Error('down')),
    });
    await expect(
      receiveQuiz(body(), importer, failing.store, 1, 'send-1')
    ).rejects.toThrow('down');
    expect(failing.calls.some((c) => c.includes('/old/'))).toBe(false);
  });

  it('refuses without the flag or a SpartBoard account', async () => {
    const { store } = memoryStore();
    expect(
      await status(receiveQuiz(body(), { ...importer, enabled: false }, store))
    ).toBe(403);
    expect(
      await status(receiveQuiz(body(), { ...importer, uid: null }, store))
    ).toBe(403);
  });

  it('caps a full inbox but still replaces an existing item', async () => {
    const full = memoryStore({ count: () => Promise.resolve(MAX_INBOX_ITEMS) });
    expect(await status(receiveQuiz(body(), importer, full.store))).toBe(429);
    const again = memoryStore({
      count: () => Promise.resolve(MAX_INBOX_ITEMS),
      previousSend: () => Promise.resolve('old'),
    });
    expect(await status(receiveQuiz(body(), importer, again.store))).toBe(200);
  });

  it('clears uploaded pictures when the write fails', async () => {
    const { store, calls } = memoryStore({
      write: () => Promise.reject(new Error('down')),
    });
    await expect(
      receiveQuiz(body(), importer, store, 1, 'send-1')
    ).rejects.toThrow('down');
    expect(calls.at(-1)).toBe(
      'clear schoology_import/uid-1/testQuiz_8629405092/send-1/'
    );
  });
});
