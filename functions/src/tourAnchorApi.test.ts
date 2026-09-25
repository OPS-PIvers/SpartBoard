import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const h = vi.hoisted(() => ({
  token: 'secret-token',
  docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  whereArgs: [] as unknown[][],
  existing: new Set<string>(),
  updates: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  commits: 0,
}));

vi.mock('./secrets', () => ({
  TOUR_ANCHOR_API_TOKEN: { value: () => h.token },
}));

vi.mock('firebase-admin', () => {
  const firestore = Object.assign(
    () => ({
      collection: (name: string) => ({
        where: (...args: unknown[]) => {
          h.whereArgs.push([name, ...args]);
          return { get: () => Promise.resolve({ docs: h.docs }) };
        },
        doc: (id: string) => ({ id }),
      }),
      getAll: (...refs: Array<{ id: string }>) =>
        Promise.resolve(refs.map((r) => ({ exists: h.existing.has(r.id) }))),
      batch: () => ({
        update: (ref: { id: string }, fields: Record<string, unknown>) =>
          h.updates.push({ id: ref.id, fields }),
        commit: () => {
          h.commits += 1;
          return Promise.resolve();
        },
      }),
    }),
    { FieldValue: { serverTimestamp: () => 'SERVER_TS' } }
  );
  return { apps: [{}], initializeApp: vi.fn(), firestore };
});

import {
  isAuthorized,
  parseResolutions,
  selectOpenItems,
  tourAnchorApi,
  API_ITEM_CAP,
  STALE_PR_MS,
} from './tourAnchorApi';

const FP = 'a'.repeat(40);
const FP2 = 'b'.repeat(40);
const ts = (ms: number) => ({ toMillis: () => ms });

type Req = {
  method: string;
  path: string;
  headers: { authorization?: string };
  body?: unknown;
};
type Handler = (
  req: Req,
  res: ReturnType<typeof makeRes>['res']
) => Promise<void>;
const handler = tourAnchorApi as unknown as Handler;

function makeRes() {
  const out = {
    status: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  };
  const res = {
    setHeader: (k: string, v: string) => (out.headers[k] = v),
    status: (code: number) => {
      out.status = code;
      return { json: (b: unknown) => (out.body = b) };
    },
    json: (b: unknown) => (out.body = b),
  };
  return { out, res };
}

const call = async (req: Partial<Req>) => {
  const { out, res } = makeRes();
  await handler({ method: 'GET', path: '/', headers: {}, ...req } as Req, res);
  return out;
};

const bearer = { authorization: 'Bearer secret-token' };

beforeEach(() => {
  h.token = 'secret-token';
  h.docs = [];
  h.whereArgs = [];
  h.existing = new Set();
  h.updates = [];
  h.commits = 0;
});

describe('isAuthorized', () => {
  it('accepts only the exact bearer token', () => {
    expect(isAuthorized('Bearer secret-token', 'secret-token')).toBe(true);
    expect(isAuthorized(undefined, 'secret-token')).toBe(false);
    expect(isAuthorized('secret-token', 'secret-token')).toBe(false);
    expect(isAuthorized('Bearer wrong-token!', 'secret-token')).toBe(false);
    expect(isAuthorized('Bearer x', 'secret-token')).toBe(false);
    expect(isAuthorized('Bearer ', '')).toBe(false);
  });
});

describe('tourAnchorApi auth', () => {
  it.each([
    ['missing', {}],
    ['wrong', { authorization: 'Bearer nope-nope-nope' }],
    ['different length', { authorization: 'Bearer s' }],
  ])('returns 401 for a %s token', async (_label, headers) => {
    const out = await call({ headers });
    expect(out.status).toBe(401);
    expect(out.headers['X-Request-Id']).toBeTruthy();
    expect(h.whereArgs).toHaveLength(0);
  });

  it('returns 401 when the secret is unset', async () => {
    h.token = '';
    expect((await call({ headers: { authorization: 'Bearer ' } })).status).toBe(
      401
    );
  });
});

describe('selectOpenItems', () => {
  const now = 1_000_000_000_000;
  it('keeps open items and week-old PRs, oldest first, capped', () => {
    const docs = [
      { id: 'new', data: { status: 'open', firstSeenAt: ts(3) } },
      { id: 'old', data: { status: 'open', firstSeenAt: ts(1) } },
      {
        id: 'fresh-pr',
        data: {
          status: 'pr-open',
          updatedAt: ts(now - 1000),
          firstSeenAt: ts(0),
        },
      },
      {
        id: 'stale-pr',
        data: {
          status: 'pr-open',
          updatedAt: ts(now - STALE_PR_MS - 1),
          firstSeenAt: ts(2),
        },
      },
      { id: 'human', data: { status: 'needs-human', firstSeenAt: ts(0) } },
    ];
    expect(selectOpenItems(docs, now).map((i) => i.fingerprint)).toEqual([
      'old',
      'stale-pr',
      'new',
    ]);
    const many = Array.from({ length: 80 }, (_, i) => ({
      id: String(i),
      data: { status: 'open', firstSeenAt: ts(i) },
    }));
    expect(selectOpenItems(many, now)).toHaveLength(API_ITEM_CAP);
  });

  it('drops reboundAt and returns ISO timestamps', () => {
    const [item] = selectOpenItems(
      [
        {
          id: FP,
          data: {
            status: 'open',
            name: 'start',
            firstSeenAt: ts(0),
            updatedAt: ts(0),
            reboundAt: ts(0),
          },
        },
      ],
      0
    );
    expect(item).toEqual({
      fingerprint: FP,
      status: 'open',
      name: 'start',
      firstSeenAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    });
  });
});

describe('GET /', () => {
  it('queries only open and pr-open items', async () => {
    h.docs = [{ id: FP, data: () => ({ status: 'open', firstSeenAt: ts(0) }) }];
    const out = await call({ headers: bearer });
    expect(out.status).toBe(200);
    expect(h.whereArgs).toEqual([
      ['tour_anchor_queue', 'status', 'in', ['open', 'pr-open']],
    ]);
    expect((out.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('404s anything else', async () => {
    expect((await call({ headers: bearer, path: '/other' })).status).toBe(404);
    expect(
      (await call({ headers: bearer, method: 'DELETE', path: '/' })).status
    ).toBe(404);
  });
});

describe('parseResolutions', () => {
  const pr = {
    fingerprint: FP,
    status: 'pr-open',
    anchorId: 'dock.item',
    prUrl: 'https://github.com/OPS-PIvers/SpartBoard/pull/12',
  };
  it('accepts pr-open and needs-human', () => {
    const r = parseResolutions([
      pr,
      { fingerprint: FP2, status: 'needs-human', reason: ' portal ' },
    ]);
    expect(r).toEqual({
      ok: true,
      items: [
        pr,
        { fingerprint: FP2, status: 'needs-human', reason: 'portal' },
      ],
    });
  });

  it.each([
    ['not an array', {}],
    ['empty', []],
    ['bad fingerprint', [{ ...pr, fingerprint: 'nope' }]],
    ['status outside the enum', [{ ...pr, status: 'mapped' }]],
    ['status rebound', [{ ...pr, status: 'rebound' }]],
    ['bad anchor id', [{ ...pr, anchorId: 'Drop Table' }]],
    ['non-github pr url', [{ ...pr, prUrl: 'https://evil.test/pull/1' }]],
    ['pr-open without a url', [{ ...pr, prUrl: undefined }]],
    [
      'needs-human without a reason',
      [{ fingerprint: FP, status: 'needs-human' }],
    ],
    ['too many', Array.from({ length: 101 }, () => pr)],
  ])('rejects %s', (_label, body) => {
    expect(parseResolutions(body).ok).toBe(false);
  });

  it('writes only whitelisted fields', () => {
    const r = parseResolutions([{ ...pr, occurrences: [], status2: 'x' }]);
    expect(r.ok && Object.keys(r.items[0]).sort()).toEqual(
      ['anchorId', 'fingerprint', 'prUrl', 'status'].sort()
    );
  });
});

describe('POST /resolve', () => {
  it('updates existing items and reports missing ones', async () => {
    h.existing.add(FP);
    const out = await call({
      headers: bearer,
      method: 'POST',
      path: '/resolve',
      body: [
        { fingerprint: FP, status: 'needs-human', reason: 'in an iframe' },
        { fingerprint: FP2, status: 'needs-human', reason: 'gone' },
      ],
    });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ updated: 1, missing: [FP2] });
    expect(h.updates).toEqual([
      {
        id: FP,
        fields: {
          status: 'needs-human',
          reason: 'in an iframe',
          updatedAt: 'SERVER_TS',
        },
      },
    ]);
    expect(h.commits).toBe(1);
  });

  it('400s an invalid body without writing', async () => {
    const out = await call({
      headers: bearer,
      method: 'POST',
      path: '/resolve',
      body: [{ fingerprint: FP, status: 'open' }],
    });
    expect(out.status).toBe(400);
    expect(h.updates).toHaveLength(0);
  });
});
