// Coverage for the Claude connector's public HTTP entry point: the bearer-token
// gate, the per-instance daily call cap, and the early-exit HTTP branches that
// run before the (untestable-without-the-SDK) MCP transport takes over.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { makeStubFirestore } from '../testing/stubFirestore';

const state: { db: unknown; featureGranted: boolean } = {
  db: null,
  featureGranted: true,
};

vi.mock('firebase-admin', () => ({ firestore: () => state.db }));
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('../functionsInit', () => ({}));
// `isConnectorFeatureGranted` lazy-imports the heavy quizMediaArchive module
// (ffmpeg, Drive, etc.) — irrelevant to this endpoint's own logic and not
// worth dragging into a unit test of the auth gate. Stub it directly so
// `isGrantActive`'s own caching/gating behavior is what's under test.
vi.mock('./eligibility', () => ({
  isConnectorFeatureGranted: () => Promise.resolve(state.featureGranted),
}));

import { DAILY_CALL_LIMIT_PER_INSTANCE } from './config';
import { resetSigningKeyCache, signAccessToken } from './tokens';
import { isGrantActive, mcpServer, takeCall } from './mcpEndpoint';

const TEACHER = 'teacher@orono.k12.mn.us';

function seedDb(overrides: Record<string, Record<string, unknown>> = {}) {
  const stub = makeStubFirestore({ ...overrides });
  state.db = stub.db;
  return stub;
}

async function grantToken(
  stub: ReturnType<typeof makeStubFirestore>,
  uid: string,
  grantId: string,
  email = TEACHER
): Promise<string> {
  await stub.db.doc(`users/${uid}/mcp_grants/${grantId}`).set({
    revokedAt: null,
  });
  return signAccessToken(
    stub.db as unknown as Parameters<typeof signAccessToken>[0],
    { uid, email, grantId }
  );
}

interface FakeRes {
  headersSent: boolean;
  set: (key: string, value: string) => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  send: (body: unknown) => FakeRes;
  on: (event: string, cb: () => void) => void;
}

function makeRes(): {
  out: { statusCode: number; body: unknown };
  res: FakeRes;
} {
  const out: { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: undefined,
  };
  const res: FakeRes = {
    headersSent: false,
    set: () => res,
    status: (code) => {
      out.statusCode = code;
      return res;
    },
    json: (body) => {
      out.body = body;
      res.headersSent = true;
      return res;
    },
    send: (body) => {
      out.body = body;
      res.headersSent = true;
      return res;
    },
    on: () => {},
  };
  return { out, res };
}

type Req = { method: string; headers: Record<string, string>; body?: unknown };
const handler = mcpServer as unknown as (
  req: Req,
  res: FakeRes
) => Promise<void>;

beforeEach(() => {
  resetSigningKeyCache();
  state.featureGranted = true;
});

describe('isGrantActive', () => {
  // Each case uses its own uid/grantId: `isGrantActive` caches results in a
  // module-level, process-lifetime map keyed on `${uid}/${grantId}`, so two
  // cases sharing a key at the same `now` would read each other's cached
  // answer instead of exercising their own scenario.
  it('is false when no grant document exists', async () => {
    const stub = seedDb();
    const ok = await isGrantActive(
      stub.db as unknown as Parameters<typeof isGrantActive>[0],
      { uid: 'no-grant', email: TEACHER, grantId: 'g' },
      1_000
    );
    expect(ok).toBe(false);
  });

  it('is true for an unrevoked grant when the connector feature is granted', async () => {
    const stub = seedDb({ 'users/active/mcp_grants/g': { revokedAt: null } });
    const ok = await isGrantActive(
      stub.db as unknown as Parameters<typeof isGrantActive>[0],
      { uid: 'active', email: TEACHER, grantId: 'g' },
      1_000
    );
    expect(ok).toBe(true);
  });

  it('is false once the grant is revoked', async () => {
    const stub = seedDb({
      'users/revoked/mcp_grants/g': { revokedAt: 999 },
    });
    const ok = await isGrantActive(
      stub.db as unknown as Parameters<typeof isGrantActive>[0],
      { uid: 'revoked', email: TEACHER, grantId: 'g' },
      1_000
    );
    expect(ok).toBe(false);
  });

  it('is false when the connector feature is disabled', async () => {
    const stub = seedDb({
      'users/gate-off/mcp_grants/g': { revokedAt: null },
    });
    state.featureGranted = false;
    const ok = await isGrantActive(
      stub.db as unknown as Parameters<typeof isGrantActive>[0],
      { uid: 'gate-off', email: TEACHER, grantId: 'g' },
      1_000
    );
    expect(ok).toBe(false);
  });

  it('caches a result per instance and only re-queries after the cache expires', async () => {
    const stub = seedDb({ 'users/cached/mcp_grants/g': { revokedAt: null } });
    const claims = { uid: 'cached', email: TEACHER, grantId: 'g' };
    expect(
      await isGrantActive(
        stub.db as unknown as Parameters<typeof isGrantActive>[0],
        claims,
        10_000
      )
    ).toBe(true);
    // The grant is revoked out from under the cache; a call still inside the
    // cache window must keep returning the stale (cached) answer.
    await stub.db
      .doc('users/cached/mcp_grants/g')
      .update({ revokedAt: 10_500 });
    expect(
      await isGrantActive(
        stub.db as unknown as Parameters<typeof isGrantActive>[0],
        claims,
        10_500
      )
    ).toBe(true);
    // Once the cache window (STATUS_CACHE_MS = 60s) has elapsed, the fresh
    // revoked state must be picked up.
    expect(
      await isGrantActive(
        stub.db as unknown as Parameters<typeof isGrantActive>[0],
        claims,
        71_000
      )
    ).toBe(false);
  });
});

describe('takeCall', () => {
  it('allows calls up to the daily per-instance ceiling, then denies', () => {
    const uid = 'rate-limit-a';
    for (let i = 0; i < DAILY_CALL_LIMIT_PER_INSTANCE; i += 1) {
      expect(takeCall(uid, 1_000)).toBe(true);
    }
    expect(takeCall(uid, 1_000)).toBe(false);
  });

  it('resets the count on a new UTC day', () => {
    const uid = 'rate-limit-b';
    for (let i = 0; i < DAILY_CALL_LIMIT_PER_INSTANCE; i += 1) {
      takeCall(uid, 1_000);
    }
    expect(takeCall(uid, 1_000)).toBe(false);
    const nextDay = Date.parse('2026-01-02T00:00:00.000Z');
    expect(takeCall(uid, nextDay)).toBe(true);
  });
});

describe('mcpServer handler — early-exit branches', () => {
  it('answers CORS preflight without touching auth', async () => {
    seedDb();
    const { out, res } = makeRes();
    await handler({ method: 'OPTIONS', headers: {} }, res);
    expect(out.statusCode).toBe(204);
  });

  it('rejects a request with no bearer token', async () => {
    seedDb();
    const { out, res } = makeRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(out.statusCode).toBe(401);
    expect(out.body).toMatchObject({ error: 'invalid_token' });
  });

  it('rejects a malformed/invalid bearer token', async () => {
    seedDb();
    const { out, res } = makeRes();
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer not-a-real-token' } },
      res
    );
    expect(out.statusCode).toBe(401);
  });

  it('rejects a valid token whose grant was revoked', async () => {
    const stub = seedDb({
      'users/u2/mcp_grants/g2': { revokedAt: 5 },
    });
    const token = await signAccessToken(
      stub.db as unknown as Parameters<typeof signAccessToken>[0],
      { uid: 'u2', email: TEACHER, grantId: 'g2' }
    );
    const { out, res } = makeRes();
    await handler(
      { method: 'POST', headers: { authorization: `Bearer ${token}` } },
      res
    );
    expect(out.statusCode).toBe(401);
    expect(out.body).toMatchObject({ error: 'invalid_token' });
  });

  it('rejects a valid token when the connector feature is off (gate closed)', async () => {
    const stub = seedDb({
      'users/u3/mcp_grants/g3': { revokedAt: null },
    });
    state.featureGranted = false;
    const token = await signAccessToken(
      stub.db as unknown as Parameters<typeof signAccessToken>[0],
      { uid: 'u3', email: TEACHER, grantId: 'g3' }
    );
    const { out, res } = makeRes();
    await handler(
      { method: 'POST', headers: { authorization: `Bearer ${token}` } },
      res
    );
    expect(out.statusCode).toBe(401);
  });

  it('returns 405 for a non-POST method once authenticated', async () => {
    const stub = seedDb();
    const token = await grantToken(stub, 'u4', 'g4');
    const { out, res } = makeRes();
    await handler(
      { method: 'GET', headers: { authorization: `Bearer ${token}` } },
      res
    );
    expect(out.statusCode).toBe(405);
  });

  it('returns 429 once the per-instance daily call cap is exhausted', async () => {
    const stub = seedDb();
    const uid = 'rate-limit-handler';
    const token = await grantToken(stub, uid, 'g5', TEACHER);
    for (let i = 0; i < DAILY_CALL_LIMIT_PER_INSTANCE; i += 1) {
      takeCall(uid);
    }
    const { out, res } = makeRes();
    await handler(
      { method: 'POST', headers: { authorization: `Bearer ${token}` } },
      res
    );
    expect(out.statusCode).toBe(429);
  });
});
