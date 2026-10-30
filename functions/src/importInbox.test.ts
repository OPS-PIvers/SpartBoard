// The Import inbox: token and flag checks, Send validation, the block list and the reader-failure log.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_o: unknown, h: unknown) => h,
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./glTours', () => ({
  GL_TOURS_COLLECTION: 'building_guided_learning_tours',
}));

import { ExtensionCallError } from './webTourExtension';
import {
  checkImporter,
  failureUrl,
  importStatus,
  parseSendRequest,
  receiveSend,
  sendId,
  type Importer,
  type ImporterDeps,
  type ImportStore,
} from './importInbox';
import {
  DEFAULT_SEND_BLOCK_PATTERNS,
  IMPORT_INBOX_TTL_MS,
  IMPORT_MAX_BLOCKS,
  IMPORT_MAX_INBOX_ITEMS,
  IMPORT_READER_FAILURE_TTL_MS,
} from './import/shared.gen';

const CLIENT = 'client-123.apps.googleusercontent.com';

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
  url: 'https://www.example.org/lesson?id=42#top',
  title: '  The water cycle ',
  platform: 'generic',
  selectionOnly: false,
  blocks: [
    { type: 'heading', level: 1, text: 'The water cycle' },
    { type: 'paragraph', text: 'Water evaporates.' },
    { type: 'table', rows: [{ cells: ['term', 'meaning'] }] },
  ],
  images: [{ url: 'https://www.example.org/a.png', alt: 'A cloud' }],
  ...over,
});

const ME: Importer = {
  email: 't@orono.k12.mn.us',
  uid: 'uid-1',
  enabled: true,
};

function store(over: Partial<ImportStore> = {}) {
  const writes: { uid: string; id: string; doc: object; expireAt: number }[] =
    [];
  const failures: { doc: object; expireAt: number }[] = [];
  const s: ImportStore = {
    blockPatterns: () => Promise.resolve([...DEFAULT_SEND_BLOCK_PATTERNS]),
    count: () => Promise.resolve(0),
    exists: () => Promise.resolve(false),
    write: (uid, id, doc, expireAt) => {
      writes.push({ uid, id, doc, expireAt });
      return Promise.resolve();
    },
    logFailure: (doc, expireAt) => {
      failures.push({ doc, expireAt });
      return Promise.resolve();
    },
    ...over,
  };
  return { s, writes, failures };
}

const status = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ExtensionCallError);
    return (e as ExtensionCallError).status;
  }
  return 200;
};

describe('checkImporter', () => {
  it('admits a verified district token and reports the flag', async () => {
    expect(await checkImporter('tok', deps())).toEqual({
      email: 'teacher@orono.k12.mn.us',
      uid: 'uid-1',
      enabled: true,
    });
  });

  it('refuses another client or domain', async () => {
    expect(
      await status(
        checkImporter(
          'tok',
          deps({
            tokenInfo: () =>
              Promise.resolve({
                aud: 'other',
                email: 'a@orono.k12.mn.us',
                email_verified: 'true',
                expires_in: '3000',
              }),
          })
        )
      )
    ).toBe(401);
    expect(
      await status(
        checkImporter(
          'tok',
          deps({
            tokenInfo: () =>
              Promise.resolve({
                aud: CLIENT,
                email: 'a@gmail.com',
                email_verified: 'true',
                expires_in: '3000',
              }),
          })
        )
      )
    ).toBe(403);
  });

  it('is unavailable without a client id', async () => {
    expect(await status(checkImporter('tok', deps({ clientId: '' })))).toBe(
      503
    );
  });
});

describe('importStatus', () => {
  it('sends the block list only to an enabled importer', async () => {
    const { s } = store();
    expect((await importStatus(ME, s)).blockPatterns).toEqual(
      DEFAULT_SEND_BLOCK_PATTERNS
    );
    expect(await importStatus({ ...ME, enabled: false, uid: null }, s)).toEqual(
      { enabled: false, hasAccount: false, blockPatterns: [] }
    );
  });
});

describe('parseSendRequest', () => {
  it('keeps known fields, trims the title and drops the rest', () => {
    const parsed = parseSendRequest(
      body({ extra: 'x', blocks: [{ type: 'quote', text: 'q', html: '<b>' }] })
    );
    expect(parsed.title).toBe('The water cycle');
    expect(parsed.blocks).toEqual([{ type: 'quote', text: 'q' }]);
    expect(parsed).not.toHaveProperty('extra');
  });

  it.each([
    ['a non-http url', { url: 'javascript:alert(1)' }],
    ['a url with credentials', { url: 'https://a:b@example.org/' }],
    ['no blocks', { blocks: [] }],
    ['an unknown block type', { blocks: [{ type: 'script', text: 'x' }] }],
    [
      'a bad heading level',
      { blocks: [{ type: 'heading', level: 9, text: 'x' }] },
    ],
    ['a bad platform', { platform: 'Bad Platform' }],
    ['a missing selection flag', { selectionOnly: undefined }],
    ['an empty title', { title: '   ' }],
    ['a data: image', { images: [{ url: 'data:image/png;base64,AA==' }] }],
    ['a bad reader failure', { readerFailure: { platform: 'x', reason: 1 } }],
  ])('refuses %s', (_name, over) => {
    expect(() => parseSendRequest(body(over))).toThrow(ExtensionCallError);
  });

  it('refuses too many blocks with 413', async () => {
    const blocks = Array.from({ length: IMPORT_MAX_BLOCKS + 1 }, () => ({
      type: 'paragraph',
      text: 'x',
    }));
    expect(
      await status(
        Promise.resolve().then(() => parseSendRequest(body({ blocks })))
      )
    ).toBe(413);
  });
});

describe('receiveSend', () => {
  it('stores the Send under a content id with a TTL', async () => {
    const { s, writes } = store();
    const reply = await receiveSend(body(), ME, s, 1000);
    expect(reply).toEqual({
      id: sendId(parseSendRequest(body())),
      blocks: 3,
      images: 1,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].uid).toBe('uid-1');
    expect(writes[0].expireAt).toBe(1000 + IMPORT_INBOX_TTL_MS);
    expect(writes[0].doc).toMatchObject({
      receivedAt: 1000,
      platform: 'generic',
    });
    expect(writes[0].doc).not.toHaveProperty('readerFailure');
  });

  it('gives the same content the same id, and a selection a different one', () => {
    const a = sendId(parseSendRequest(body()));
    expect(sendId(parseSendRequest(body({ title: 'Renamed' })))).toBe(a);
    expect(sendId(parseSendRequest(body({ selectionOnly: true })))).not.toBe(a);
  });

  it('refuses a blocked page, even when the extension sent it', async () => {
    const { s, writes } = store();
    expect(
      await status(
        receiveSend(
          body({ url: 'https://orono.schoology.com/course/1/gradebook' }),
          ME,
          s
        )
      )
    ).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('obeys the admin list over the defaults', async () => {
    const { s } = store({
      blockPatterns: () => Promise.resolve(['*.example.org']),
    });
    expect(await status(receiveSend(body(), ME, s))).toBe(403);
  });

  it('refuses without the flag or an account', async () => {
    expect(
      await status(receiveSend(body(), { ...ME, enabled: false }, store().s))
    ).toBe(403);
    expect(
      await status(receiveSend(body(), { ...ME, uid: null }, store().s))
    ).toBe(403);
  });

  it('caps the inbox, but lets a re-send replace its copy', async () => {
    const full = store({
      count: () => Promise.resolve(IMPORT_MAX_INBOX_ITEMS),
    });
    expect(await status(receiveSend(body(), ME, full.s))).toBe(429);
    const again = store({
      count: () => Promise.resolve(IMPORT_MAX_INBOX_ITEMS),
      exists: () => Promise.resolve(true),
    });
    await receiveSend(body(), ME, again.s);
    expect(again.writes).toHaveLength(1);
  });

  it('logs a reader failure without the query or hash', async () => {
    const { s, failures } = store();
    await receiveSend(
      body({
        readerFailure: { platform: 'schoology', reason: 'no questions' },
      }),
      ME,
      s,
      5
    );
    expect(failures).toEqual([
      {
        doc: {
          uid: 'uid-1',
          platform: 'schoology',
          reason: 'no questions',
          url: 'https://www.example.org/lesson',
          createdAt: 5,
        },
        expireAt: 5 + IMPORT_READER_FAILURE_TTL_MS,
      },
    ]);
  });

  it('still stores the Send when the failure log fails', async () => {
    const { s, writes } = store({
      logFailure: () => Promise.reject(new Error('down')),
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await receiveSend(
      body({ readerFailure: { platform: 'schoology', reason: 'x' } }),
      ME,
      s
    );
    expect(writes).toHaveLength(1);
  });
});

describe('failureUrl', () => {
  it('keeps origin and path only', () => {
    expect(failureUrl('https://a.example/x/y?student=1#h')).toBe(
      'https://a.example/x/y'
    );
  });
});
