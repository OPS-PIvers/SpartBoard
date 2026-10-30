// The student endpoints' outer checks: method, Chrome token, district domain, roster lookup and error bodies.
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Hoisted {
  tokenInfo: Record<string, unknown> | null;
  lookups: number;
  lookup: 'roster' | 'test' | 'not-in-roster' | 'roster-unavailable';
  sessions: Array<{ id: string; data: Record<string, unknown> }>;
  errors: unknown[][];
}

const h = vi.hoisted((): Hoisted => ({
  tokenInfo: null,
  lookups: 0,
  lookup: 'roster',
  sessions: [],
  errors: [],
}));

vi.mock('../functionsInit', () => ({}));
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_o: unknown, handler: unknown) => handler,
  onCall: (_o: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {},
}));
vi.mock('../secrets', () => {
  const secret = (v: string) => ({ value: () => v });
  return {
    CLASSLINK_CLIENT_ID: secret('cl-id'),
    CLASSLINK_CLIENT_SECRET: secret('cl-secret'),
    CLASSLINK_TENANT_URL: secret('https://tenant'),
    STUDENT_PSEUDONYM_HMAC_SECRET: secret('hmac'),
  };
});
vi.mock('../webTourExtension', async () => {
  const actual = await vi.importActual<typeof import('../webTourExtension')>(
    '../webTourExtension'
  );
  return {
    ...actual,
    EXTENSION_OAUTH_CLIENTS: { 'spartboard-dev': 'client-dev' },
    fetchTokenInfo: () => Promise.resolve(h.tokenInfo),
  };
});
vi.mock('../studentEmailIdentity', async () => {
  const actual = await vi.importActual<
    typeof import('../studentEmailIdentity')
  >('../studentEmailIdentity');
  return {
    ...actual,
    resolveStudentByEmail: () => {
      h.lookups++;
      if (h.lookup === 'test')
        return Promise.resolve({
          kind: 'test',
          orgId: 'orono',
          uid: 'test-uid',
          mockClassIds: ['mock-period-1'],
        });
      if (h.lookup !== 'roster')
        return Promise.reject(new actual.StudentLookupError(h.lookup));
      return Promise.resolve({
        kind: 'roster',
        orgId: 'orono',
        uid: 'pseudo-uid',
        sourcedId: 'sid',
      });
    },
  };
});
vi.mock('firebase-admin', () => {
  const emptyDoc = { exists: false, get: () => undefined };
  const docRef = (): Record<string, unknown> => ({
    get: () => Promise.resolve(emptyDoc),
    set: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    collection: () => ({ doc: docRef }),
  });
  const query = {
    where: () => query,
    limit: () => query,
    get: () =>
      Promise.resolve({
        empty: h.sessions.length === 0,
        docs: h.sessions.map((s) => ({ id: s.id, data: () => s.data })),
      }),
  };
  const db = {
    collection: () => ({ doc: docRef, ...query }),
    getAll: (...refs: unknown[]) => Promise.resolve(refs.map(() => emptyDoc)),
  };
  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore: () => db,
  };
});

import { focusReportV1, focusStatusV1 } from './studentEndpoints';

type Endpoint = (req: unknown, res: unknown) => Promise<void>;

const call = async (
  fn: unknown,
  body: unknown,
  opts: { method?: string; auth?: string | null } = {}
) => {
  const { method = 'POST', auth = 'Bearer tok' } = opts;
  const out = { status: 200, body: undefined as unknown };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(value: unknown) {
      out.body = value;
    },
  };
  const req = {
    method,
    body,
    get: (name: string) =>
      name.toLowerCase() === 'authorization' ? (auth ?? undefined) : undefined,
  };
  await (fn as Endpoint)(req, res);
  return out;
};

let tokenCounter = 0;
const freshToken = () => `Bearer tok-${++tokenCounter}`;
const reportBody = {
  sessionId: 's1',
  protocol: 9,
  status: 'on-task',
  blockedTries: 0,
};

beforeEach(() => {
  process.env.GCLOUD_PROJECT = 'spartboard-dev';
  h.tokenInfo = {
    aud: 'client-dev',
    email: `kid${tokenCounter + 1}@orono.k12.mn.us`,
    email_verified: 'true',
    expires_in: '3000',
  };
  h.lookup = 'roster';
  h.lookups = 0;
  h.sessions = [];
  h.errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    h.errors.push(args);
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('focusStatusV1', () => {
  it('answers a rostered student with no session', async () => {
    const r = await call(
      focusStatusV1,
      { protocol: 9 },
      { auth: freshToken() }
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ session: null });
  });

  it('returns the running session that lists the student', async () => {
    const now = Date.now();
    h.sessions = [
      {
        id: 's1',
        data: {
          teacherName: 'Ms. Rivera',
          level: 'lock',
          sites: [],
          studentUids: ['pseudo-uid'],
          startedAt: now - 1000,
          endsAt: now + 600_000,
          endedAt: null,
        },
      },
    ];
    const r = await call(
      focusStatusV1,
      { protocol: 9 },
      { auth: freshToken() }
    );
    expect(r.body).toMatchObject({
      session: { sessionId: 's1', level: 'lock', released: false },
    });
  });

  it('refuses a district account that ClassLink says is no student', async () => {
    h.lookup = 'not-in-roster';
    h.tokenInfo = { ...h.tokenInfo, email: 'teacher@orono.k12.mn.us' };
    expect(
      (await call(focusStatusV1, { protocol: 9 }, { auth: freshToken() }))
        .status
    ).toBe(403);
    expect(
      (await call(focusReportV1, reportBody, { auth: freshToken() })).status
    ).toBe(403);
  });

  it('serves a mock-class member', async () => {
    h.lookup = 'test';
    h.tokenInfo = { ...h.tokenInfo, email: 'sstudent25@orono.k12.mn.us' };
    const now = Date.now();
    h.sessions = [
      {
        id: 's1',
        data: {
          teacherName: 'Ms. Rivera',
          level: 'redirect',
          sites: [],
          studentUids: ['test-uid'],
          startedAt: now - 1000,
          endsAt: now + 600_000,
          endedAt: null,
        },
      },
    ];
    const r = await call(
      focusStatusV1,
      { protocol: 9 },
      { auth: freshToken() }
    );
    expect(r).toMatchObject({
      status: 200,
      body: { session: { sessionId: 's1' } },
    });
  });

  it('refuses another domain, another listing, and a missing token', async () => {
    for (const email of ['kid@gmail.com', 'kid@sub.orono.k12.mn.us']) {
      h.tokenInfo = { ...h.tokenInfo, email };
      expect(
        (await call(focusStatusV1, { protocol: 9 }, { auth: freshToken() }))
          .status
      ).toBe(403);
    }
    h.tokenInfo = {
      ...h.tokenInfo,
      email: 'kid@orono.k12.mn.us',
      aud: 'other',
    };
    expect(
      (await call(focusStatusV1, { protocol: 9 }, { auth: freshToken() }))
        .status
    ).toBe(401);
    expect(
      (await call(focusStatusV1, { protocol: 9 }, { auth: null })).status
    ).toBe(401);
    expect(h.lookups).toBe(0);
  });

  it('only takes POST', async () => {
    expect((await call(focusStatusV1, {}, { method: 'GET' })).status).toBe(405);
  });

  it('returns 503 when ClassLink is down', async () => {
    h.lookup = 'roster-unavailable';
    expect(
      (await call(focusStatusV1, { protocol: 9 }, { auth: freshToken() }))
        .status
    ).toBe(503);
  });

  it('reuses a verified token and the uid lookup within the cache window', async () => {
    const auth = freshToken();
    await call(focusStatusV1, { protocol: 9 }, { auth });
    await call(focusStatusV1, { protocol: 9 }, { auth });
    expect(h.lookups).toBe(1);
  });

  it('refuses before the listing has an OAuth client', async () => {
    process.env.GCLOUD_PROJECT = 'unknown';
    expect(
      (await call(focusStatusV1, { protocol: 9 }, { auth: freshToken() }))
        .status
    ).toBe(503);
  });
});

describe('focusReportV1', () => {
  it('refuses a student not on any roster', async () => {
    h.lookup = 'not-in-roster';
    h.tokenInfo = { ...h.tokenInfo, email: 'norost@orono.k12.mn.us' };
    const r = await call(
      focusReportV1,
      { sessionId: 's1', protocol: 9, status: 'on-task', blockedTries: 0 },
      { auth: freshToken() }
    );
    expect(r.status).toBe(403);
  });

  it('never logs the email', async () => {
    h.tokenInfo = {
      ...h.tokenInfo,
      email: 'secret-kid@orono.k12.mn.us',
    };
    await call(focusReportV1, { sessionId: 's1' }, { auth: freshToken() });
    expect(JSON.stringify(h.errors)).not.toContain('secret-kid');
  });
});
