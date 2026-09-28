// Coverage for the `revokeMcpGrantV1` callable behind the Connected apps
// "Disconnect" button (CC-D10). `authorize`/`mcpAuthorizeV1` are already
// covered end-to-end in oauth.test.ts; this file is the sibling callable in
// the same module that had no coverage at all.
import { describe, expect, it, vi } from 'vitest';
import { makeStubFirestore } from '../testing/stubFirestore';

const state: { db: unknown } = { db: null };

vi.mock('firebase-admin', () => ({ firestore: () => state.db }));
vi.mock('../functionsInit', () => ({}));

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return {
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

import { revokeMcpGrantV1 } from './authorizeCallables';

type RevokeFn = (req: {
  auth?: { uid: string; token: Record<string, unknown> };
  data?: { grantId?: unknown };
}) => Promise<{ revoked: boolean }>;

function callRevoke(
  db: unknown,
  req: Parameters<RevokeFn>[0]
): ReturnType<RevokeFn> {
  state.db = db;
  return (revokeMcpGrantV1 as unknown as RevokeFn)(req);
}

describe('revokeMcpGrantV1', () => {
  it('rejects an unauthenticated caller', async () => {
    const stub = makeStubFirestore();
    await expect(
      callRevoke(stub.db, { data: { grantId: 'g1' } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects a missing or malformed grantId', async () => {
    const stub = makeStubFirestore();
    const auth = { uid: 'u1', token: {} };
    await expect(callRevoke(stub.db, { auth, data: {} })).rejects.toMatchObject(
      { code: 'invalid-argument' }
    );
    await expect(
      callRevoke(stub.db, { auth, data: { grantId: 'has a space' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('reports revoked:false for a grant that does not exist, without writing anything', async () => {
    const stub = makeStubFirestore();
    const out = await callRevoke(stub.db, {
      auth: { uid: 'u1', token: {} },
      data: { grantId: 'ghost' },
    });
    expect(out).toEqual({ revoked: false });
    expect(stub.has('users/u1/mcp_grants/ghost')).toBe(false);
  });

  it('revokes an active grant and stamps revokedAt', async () => {
    const stub = makeStubFirestore({
      'users/u1/mcp_grants/g1': { revokedAt: null, clientName: 'Claude' },
    });
    const out = await callRevoke(stub.db, {
      auth: { uid: 'u1', token: {} },
      data: { grantId: 'g1' },
    });
    expect(out).toEqual({ revoked: true });
    expect(stub.get('users/u1/mcp_grants/g1')?.revokedAt).toEqual(
      expect.any(Number)
    );
  });

  it('is idempotent on an already-revoked grant — does not stamp a new revokedAt', async () => {
    const stub = makeStubFirestore({
      'users/u1/mcp_grants/g1': { revokedAt: 12345 },
    });
    const out = await callRevoke(stub.db, {
      auth: { uid: 'u1', token: {} },
      data: { grantId: 'g1' },
    });
    expect(out).toEqual({ revoked: true });
    expect(stub.get('users/u1/mcp_grants/g1')?.revokedAt).toBe(12345);
  });

  it('scopes the grant lookup to the caller uid — cannot revoke another user’s grant', async () => {
    const stub = makeStubFirestore({
      'users/victim/mcp_grants/g1': { revokedAt: null },
    });
    const out = await callRevoke(stub.db, {
      auth: { uid: 'attacker', token: {} },
      data: { grantId: 'g1' },
    });
    expect(out).toEqual({ revoked: false });
    expect(stub.get('users/victim/mcp_grants/g1')?.revokedAt).toBeNull();
  });
});
