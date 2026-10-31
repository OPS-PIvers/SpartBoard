// The Import inbox: token and flag checks, Send validation, the block list and the reader-failure log.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
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
  storedUrl,
  isSecretParam,
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
  IMPORT_MAX_CARDS,
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
    ['a bad video id', { video: { youtubeId: 'nope', stops: [] } }],
    [
      'a video end before its start',
      { video: { youtubeId: 'WjqqUjDkh1c', start: 9, end: 3, stops: [] } },
    ],
    [
      'a negative stop time',
      {
        video: {
          youtubeId: 'WjqqUjDkh1c',
          stops: [{ kind: 'note', time: -1, text: 'x' }],
        },
      },
    ],
    [
      'a picture that is not https',
      {
        video: {
          youtubeId: 'WjqqUjDkh1c',
          stops: [
            { kind: 'note', time: 1, text: 'x', image: 'http://a.b/c.png' },
          ],
        },
      },
    ],
    [
      'a choice without a correct flag',
      {
        video: {
          youtubeId: 'WjqqUjDkh1c',
          stops: [
            { kind: 'choice', time: 1, text: 'q', choices: [{ text: 'a' }] },
          ],
        },
      },
    ],
    ['cards that are not a list', { cards: { cards: 'x' } }],
    ['a card without a definition', { cards: { cards: [{ term: 'a' }] } }],
    [
      'a bad card language',
      { cards: { cards: [], termLanguage: 'en US<script>' } },
    ],
    [
      'too many cards',
      {
        cards: {
          cards: Array.from({ length: IMPORT_MAX_CARDS + 1 }, () => ({
            term: 'a',
            definition: 'b',
          })),
        },
      },
    ],
  ])('refuses %s', (_name, over) => {
    expect(() => parseSendRequest(body(over))).toThrow(ExtensionCallError);
  });

  it('keeps a card set and drops its unknown fields', () => {
    const cards = {
      cards: [{ term: 'el perro', definition: 'the dog', image: 'x' }],
      termLanguage: 'es',
      definitionLanguage: 'en',
      leftOut: { picture: 1, audio: 0, other: 3 },
      extra: true,
    };
    expect(parseSendRequest(body({ cards })).cards).toEqual({
      cards: [{ term: 'el perro', definition: 'the dog' }],
      termLanguage: 'es',
      definitionLanguage: 'en',
      leftOut: { picture: 1 },
    });
  });

  it('keeps a video lesson and drops its unknown fields', () => {
    const video = {
      youtubeId: 'WjqqUjDkh1c',
      start: 2,
      end: 90,
      stops: [
        {
          kind: 'choice',
          time: 10,
          text: 'Weather is...',
          choices: [{ text: 'daily', correct: true, html: '<p>' }],
        },
        {
          kind: 'open',
          time: 80,
          text: 'Why?',
          image: 'https://img.example/a.png',
        },
        { kind: 'note', time: 40, text: 'Look here', id: 'x' },
      ],
    };
    expect(parseSendRequest(body({ video })).video).toEqual({
      youtubeId: 'WjqqUjDkh1c',
      start: 2,
      end: 90,
      stops: [
        {
          kind: 'choice',
          time: 10,
          text: 'Weather is...',
          choices: [{ text: 'daily', correct: true }],
        },
        {
          kind: 'open',
          time: 80,
          text: 'Why?',
          image: 'https://img.example/a.png',
        },
        { kind: 'note', time: 40, text: 'Look here' },
      ],
    });
  });

  it('keeps the left-out counts above zero and drops unknown kinds', () => {
    const video = {
      youtubeId: 'WjqqUjDkh1c',
      stops: [],
      leftOut: { question: 2, voiceover: 0, cut: 1, other: 5 },
    };
    expect(parseSendRequest(body({ video })).video?.leftOut).toEqual({
      question: 2,
      cut: 1,
    });
    expect(() =>
      parseSendRequest(body({ video: { ...video, leftOut: { question: -1 } } }))
    ).toThrow(ExtensionCallError);
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

describe('blocked pictures', () => {
  it('drops a picture from a blocked site and keeps the rest', async () => {
    const { s, writes } = store();
    const reply = await receiveSend(
      body({
        images: [
          { url: 'https://www.example.org/a.png' },
          { url: 'https://mn.infinitecampus.org/personPicture.jpg' },
        ],
      }),
      ME,
      s
    );
    expect(reply.images).toBe(1);
    expect(writes[0].doc).toMatchObject({
      images: [{ url: 'https://www.example.org/a.png' }],
    });
  });

  it('drops a lesson stop picture from a blocked site and keeps the stop', async () => {
    const { s, writes } = store();
    await receiveSend(
      body({
        video: {
          youtubeId: 'WjqqUjDkh1c',
          stops: [
            {
              kind: 'note',
              time: 3,
              text: 'Look',
              image: 'https://mn.infinitecampus.org/personPicture.jpg',
            },
            {
              kind: 'note',
              time: 5,
              text: 'Here',
              image: 'https://www.example.org/a.png',
            },
          ],
        },
      }),
      ME,
      s
    );
    expect(writes[0].doc).toMatchObject({
      video: {
        stops: [
          { kind: 'note', time: 3, text: 'Look' },
          { image: 'https://www.example.org/a.png' },
        ],
      },
    });
    const first = (writes[0].doc as { video: { stops: object[] } }).video
      .stops[0];
    expect(first).not.toHaveProperty('image');
  });

  it('counts empty table cells toward the text cap', () => {
    const rows = Array.from({ length: 500 }, () => ({
      cells: Array(20).fill(''),
    }));
    const blocks = Array.from({ length: 50 }, () => ({ type: 'table', rows }));
    expect(() => parseSendRequest(body({ blocks }))).toThrow(
      ExtensionCallError
    );
  });
});

describe('storedUrl', () => {
  it('drops the fragment and sign-in tokens, keeping other params', () => {
    expect(
      storedUrl('https://a.example/p?id=4&access_token=s&X-Amz-Signature=t#x')
    ).toBe('https://a.example/p?id=4');
  });

  it('drops signed-link and API credentials by family', () => {
    const url = storedUrl(
      'https://a.example/p?page=2&X-Goog-Signature=a&X-Goog-Credential=b&Policy=c&Key-Pair-Id=d&refresh_token=e&apikey=f&client_secret=g&password=h&jwt=i'
    );
    expect(url).toBe('https://a.example/p?page=2');
  });
});

describe('isSecretParam', () => {
  it.each([
    'access_token',
    'refresh_token',
    'id_token',
    'token',
    'apikey',
    'api-key',
    'x-api-key',
    'apiKey',
    'client_secret',
    'password',
    'sessionid',
    'session_id',
    'PHPSESSID',
    'access_key',
    'AWSAccessKeyId',
    'X-Goog-Signature',
    'Policy',
    'Key-Pair-Id',
  ])('strips %s', (name) => {
    expect(isSecretParam(name)).toBe(true);
  });

  it.each([
    'pageToken',
    'nextPageToken',
    'continuationToken',
    'tokenizer',
    'id',
    'page',
    'keyword',
    'monkey',
    'sessions_list',
  ])('keeps %s', (name) => {
    expect(isSecretParam(name)).toBe(false);
  });
});

describe('failureUrl', () => {
  it('keeps origin and path only', () => {
    expect(failureUrl('https://a.example/x/12345?student=1#h')).toBe(
      'https://a.example/x'
    );
    expect(failureUrl('https://a.example/')).toBe('https://a.example/');
  });
});
