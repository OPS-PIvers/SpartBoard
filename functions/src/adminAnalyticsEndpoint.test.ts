// Unit tests for the `adminAnalytics` onRequest handler — specifically the
// caller-identity gate. The heavy compute path is exercised via
// `readAnalyticsSnapshot`, which we stub out entirely here.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock('./functionsInit', () => ({}));

vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: ['http://localhost'] }));

interface DecodedToken {
  email?: string;
  email_verified?: boolean;
}
interface DocSnap {
  exists: boolean;
  data?: () => unknown;
}

const verifyIdTokenMock = vi.fn<(idToken: string) => Promise<DecodedToken>>();
const adminDocGetMock = vi.fn<(id: string) => Promise<DocSnap>>();
const memberDocGetMock = vi.fn<(path: string) => Promise<DocSnap>>();

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({
    verifyIdToken: (idToken: string) => verifyIdTokenMock(idToken),
  })),
  firestore: vi.fn(() => ({
    collection: (name: string) => {
      if (name !== 'admins') throw new Error(`Unexpected collection: ${name}`);
      return { doc: (id: string) => ({ get: () => adminDocGetMock(id) }) };
    },
    doc: (path: string) => ({ get: () => memberDocGetMock(path) }),
  })),
}));

const readAnalyticsSnapshotMock = vi.fn<(orgId: string) => Promise<unknown>>();
vi.mock('./adminAnalyticsSnapshot', () => ({
  readAnalyticsSnapshot: (orgId: string) => readAnalyticsSnapshotMock(orgId),
}));

import { adminAnalytics } from './adminAnalyticsEndpoint';

type Req = { headers: { authorization?: string }; body?: unknown };
type Handler = (req: Req, res: FakeRes) => Promise<void>;
const handler = adminAnalytics as unknown as Handler;

interface FakeRes {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
  json: (body: unknown) => void;
}

function makeRes(): {
  out: { statusCode: number; body: unknown };
  res: FakeRes;
} {
  const out = { statusCode: 200, body: undefined as unknown };
  const res: FakeRes = {
    setHeader: () => {},
    status: (code: number) => {
      out.statusCode = code;
      return { json: (body: unknown) => (out.body = body) };
    },
    json: (body: unknown) => (out.body = body),
  };
  return { out, res };
}

beforeEach(() => {
  verifyIdTokenMock.mockReset();
  adminDocGetMock.mockReset();
  memberDocGetMock.mockReset();
  readAnalyticsSnapshotMock.mockReset();
  adminDocGetMock.mockResolvedValue({ exists: false });
  memberDocGetMock.mockResolvedValue({ exists: false });
  readAnalyticsSnapshotMock.mockResolvedValue(null);
});

// SECURITY: an email/password Firebase Auth account can self-report ANY
// email at sign-up — `verifyIdToken` proves the token itself is genuine, but
// the embedded `email` claim is only proven to belong to the caller once
// `email_verified` is true. Authorizing off the bare claim lets an attacker
// impersonate a real admin's address without ever owning that inbox. Same
// rail as migratePlcs.ts / organizationUserActivity.ts / isAdmin().
describe('adminAnalytics — caller identity verification', () => {
  it('SECURITY: rejects a self-reported admin email that is not verified', async () => {
    verifyIdTokenMock.mockResolvedValue({
      email: 'admin@school.org',
      email_verified: false,
    });
    adminDocGetMock.mockResolvedValue({ exists: true }); // real admin address

    const { res, out: state } = makeRes();
    await handler(
      {
        headers: { authorization: 'Bearer faketoken' },
        body: { orgId: 'org-1' },
      },
      res
    );

    expect(state.statusCode).toBe(401);
    // Must never reach the authz reads or the privileged data.
    expect(adminDocGetMock).not.toHaveBeenCalled();
    expect(readAnalyticsSnapshotMock).not.toHaveBeenCalled();
  });

  it('rejects a token with no email_verified claim at all', async () => {
    verifyIdTokenMock.mockResolvedValue({ email: 'admin@school.org' });
    adminDocGetMock.mockResolvedValue({ exists: true });

    const { res, out: state } = makeRes();
    await handler(
      {
        headers: { authorization: 'Bearer faketoken' },
        body: { orgId: 'org-1' },
      },
      res
    );

    expect(state.statusCode).toBe(401);
    expect(readAnalyticsSnapshotMock).not.toHaveBeenCalled();
  });

  it('allows a verified admin through to the snapshot read', async () => {
    verifyIdTokenMock.mockResolvedValue({
      email: 'admin@school.org',
      email_verified: true,
    });
    adminDocGetMock.mockResolvedValue({ exists: true });
    readAnalyticsSnapshotMock.mockResolvedValue(null);

    const { res, out: state } = makeRes();
    await handler(
      {
        headers: { authorization: 'Bearer faketoken' },
        body: { orgId: 'org-1' },
      },
      res
    );

    expect(readAnalyticsSnapshotMock).toHaveBeenCalledWith('org-1');
    // No snapshot yet → 503, not 401 — the identity gate passed.
    expect(state.statusCode).toBe(503);
  });
});
