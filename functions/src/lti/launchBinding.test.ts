/* eslint-disable @typescript-eslint/require-await -- mock async handlers mirror the Admin SDK. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stateStore = new Map<string, Record<string, unknown>>();
let launchMode: 'monitor' | 'enforce' = 'enforce';
let idSeq = 0;

vi.mock('../firebaseAdmin', () => ({
  firestore: vi.fn(() => ({})),
  auth: vi.fn(() => ({})),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_o: unknown, handler: unknown) => handler,
  onRequest: (_o: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {},
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'test-secret' }),
}));

vi.mock('./stores', () => ({
  newOpaqueId: vi.fn(() => `opaque-id-${String(++idSeq).padStart(32, 'x')}`),
  putOidcState: vi.fn(
    async (
      _db: unknown,
      state: string,
      nonce: string,
      extra: Record<string, unknown> = {}
    ) => {
      stateStore.set(state, { nonce, ...extra });
    }
  ),
  consumeOidcStateRecord: vi.fn(async (_db: unknown, state: string) => {
    const d = stateStore.get(state);
    stateStore.delete(state);
    if (!d) return null;
    return {
      nonce: d.nonce,
      bindingHash: (d.bindingHash as string | undefined) ?? null,
      loginParams: d.loginParams ?? null,
      topLevel: d.topLevel === true,
    };
  }),
  mintLaunchCode: vi.fn(async () => 'launch-code'),
  consumeLaunchCode: vi.fn(),
}));

vi.mock('./jwt', () => ({
  verifyLaunchJwt: vi.fn(async (token: string) => ({
    nonce: token,
    role: 'teacher',
    messageType: 'LtiResourceLinkRequest',
    isDeepLinking: false,
    sub: 'sub-1',
    deploymentId: 'd1',
    contextId: 'ctx',
    contextTitle: null,
    resourceLinkId: 'rl',
    ags: null,
    nrps: null,
    deepLinking: null,
    custom: null,
    email: null,
    name: null,
  })),
  launchRedirectTarget: () => ({ path: '/lti/teacher', deeplink: false }),
}));

vi.mock('./nrpsStore', () => ({
  persistLtiLaunchContext: vi.fn(),
  ltiQuizOwner: vi.fn(),
  resolveLtiTargetSession: vi.fn(),
}));
vi.mock('./identity', () => ({ ltiStudentUid: () => 'uid' }));
vi.mock('./classlinkBridge', () => ({ resolveClasslinkIdentity: vi.fn() }));
vi.mock('./preLinkResponse', () => ({ chooseLaunchUid: vi.fn() }));
vi.mock('../classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: () => null,
  resolveOrgIdForDomain: async () => null,
}));
vi.mock('../viewAsGuard', () => ({ assertViewAsAllowed: vi.fn() }));

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  getLtiPlatformConfig: vi.fn(async () => ({
    issuer: 'https://lms',
    clientId: 'c1',
    deploymentId: 'd1',
    authorizeUrl: 'https://lms/auth',
    launchBinding: launchMode,
  })),
  TOOL_ORIGIN: 'https://app.example',
  TOOL_LAUNCH_URL: 'https://app.example/lti/launch',
}));

import { ltiLogin, ltiLaunch } from './launchEndpoints';

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  cookies: string[];
  body: string;
  location: string | null;
  status(c: number): FakeRes;
  set(k: string, v: string): FakeRes;
  append(k: string, v: string): FakeRes;
  type(t: string): FakeRes;
  send(b: string): FakeRes;
  redirect(c: number, url: string): void;
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    headers: {},
    cookies: [],
    body: '',
    location: null,
    status(c) {
      res.statusCode = c;
      return res;
    },
    set(k, v) {
      res.headers[k.toLowerCase()] = v;
      return res;
    },
    append(k, v) {
      if (k.toLowerCase() === 'set-cookie') res.cookies.push(v);
      return res;
    },
    type(t) {
      res.headers['content-type'] = t;
      return res;
    },
    send(b) {
      res.body = b;
      return res;
    },
    redirect(c, url) {
      res.statusCode = c;
      res.location = url;
    },
  };
  return res;
}

function fakeReq(
  params: Record<string, string>,
  cookie?: string
): Record<string, unknown> {
  const headers: Record<string, string> = {
    'user-agent': 'Mozilla/5.0 Chrome/130.0',
    ...(cookie ? { cookie } : {}),
  };
  return {
    query: {},
    body: params,
    get: (h: string) => headers[h.toLowerCase()],
  };
}

type Handler = (req: unknown, res: FakeRes) => Promise<void>;
const login = ltiLogin as unknown as Handler;
const launch = ltiLaunch as unknown as Handler;

/** Runs /lti/login and returns the state, nonce and the cookie pair it set. */
async function startLogin(cookie?: string, extra: Record<string, string> = {}) {
  const res = fakeRes();
  await login(
    fakeReq(
      {
        iss: 'https://lms',
        client_id: 'c1',
        login_hint: 'hint-1',
        lti_message_hint: 'msg-1',
        ...extra,
      },
      cookie
    ),
    res
  );
  expect(res.statusCode).toBe(302);
  const auth = new URL(res.location ?? '');
  const setCookie = res.cookies[0] ?? '';
  return {
    state: auth.searchParams.get('state') ?? '',
    nonce: auth.searchParams.get('nonce') ?? '',
    cookie: setCookie.split(';')[0],
    setCookie,
  };
}

beforeEach(() => {
  stateStore.clear();
  launchMode = 'enforce';
});

describe('LTI launch browser binding', () => {
  it('sets a partitioned, cross-site cookie at login', async () => {
    const { setCookie } = await startLogin();
    expect(setCookie).toMatch(/^__session=/);
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=None');
    expect(setCookie).toContain('Partitioned');
    expect(setCookie).toContain('HttpOnly');
  });

  it('completes a launch presented by the browser that started the login', async () => {
    const { state, nonce, cookie } = await startLogin();
    const res = fakeRes();
    await launch(fakeReq({ id_token: nonce, state }, cookie), res);
    expect(res.statusCode).toBe(302);
    expect(res.location).toContain('lc=launch-code');
  });

  it('keeps the same binding for a second tab in the same browser', async () => {
    const first = await startLogin();
    const second = await startLogin(first.cookie);
    expect(second.cookie).toBe(first.cookie);
    const res = fakeRes();
    await launch(
      fakeReq({ id_token: first.nonce, state: first.state }, second.cookie),
      res
    );
    expect(res.statusCode).toBe(302);
    expect(res.location).toContain('lc=launch-code');
  });

  it('refuses a forwarded launch in a browser holding a different binding', async () => {
    const attacker = await startLogin();
    const victim = await startLogin();
    const res = fakeRes();
    await launch(
      fakeReq(
        { id_token: attacker.nonce, state: attacker.state },
        victim.cookie
      ),
      res
    );
    expect(res.location).toBeNull();
    expect(res.body).not.toContain('launch-code');
    expect(res.body).toContain('/lti/login?');
  });

  it('offers a top-level restart, not a launch code, when the cookie is missing', async () => {
    const { state, nonce } = await startLogin();
    const res = fakeRes();
    await launch(fakeReq({ id_token: nonce, state }), res);
    expect(res.location).toBeNull();
    expect(res.headers['content-type']).toBe('html');
    const href = /href="([^"]+)"/.exec(res.body)?.[1] ?? '';
    const url = new URL(href.replace(/&amp;/g, '&'), 'https://app.example');
    expect(url.pathname).toBe('/lti/login');
    expect(url.searchParams.get('login_hint')).toBe('hint-1');
    expect(url.searchParams.get('lti_message_hint')).toBe('msg-1');
    expect(url.searchParams.get('top')).toBe('1');
    expect(res.body).toContain('target="_blank"');
  });

  it('fails a top-level restart that still has no cookie instead of looping', async () => {
    const { state, nonce } = await startLogin(undefined, { top: '1' });
    const res = fakeRes();
    await launch(fakeReq({ id_token: nonce, state }), res);
    expect(res.statusCode).toBe(401);
    expect(res.location).toBeNull();
  });

  it('only logs a missing cookie in monitor mode', async () => {
    launchMode = 'monitor';
    const { state, nonce } = await startLogin();
    const res = fakeRes();
    await launch(fakeReq({ id_token: nonce, state }), res);
    expect(res.statusCode).toBe(302);
    expect(res.location).toContain('lc=launch-code');
  });

  it('lets a state saved before binding existed through', async () => {
    stateStore.set('old-state', { nonce: 'n-old' });
    const res = fakeRes();
    await launch(fakeReq({ id_token: 'n-old', state: 'old-state' }), res);
    expect(res.statusCode).toBe(302);
  });
});
