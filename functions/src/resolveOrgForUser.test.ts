import { describe, it, expect, vi, beforeEach } from 'vitest';

// Resolve-org lookup is the only Firestore touch; mock it so the callable
// tests stay pure. The pure `resolveDomainFromClaims` helper needs no mocks.
const resolveOrgIdForDomainMock = vi.fn();

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: () => ({}),
}));

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
    HttpsError,
    onCall: (_options: unknown, handler: unknown) => handler,
  };
});

vi.mock('./classlinkShared', () => ({
  // Mirror the real normalization: lowercased, leading '@', null when malformed.
  normalizeEmailDomain: (email: string): string | null => {
    const at = email.lastIndexOf('@');
    if (at < 0 || at === email.length - 1) return null;
    return '@' + email.slice(at + 1).toLowerCase();
  },
  resolveOrgIdForDomain: (...args: unknown[]): Promise<string | null> =>
    resolveOrgIdForDomainMock(...args) as Promise<string | null>,
}));

import {
  resolveDomainFromClaims,
  resolveOrgForUser,
} from './resolveOrgForUser';

type Handler = (request: unknown) => Promise<{ orgId: string | null }>;

describe('resolveDomainFromClaims', () => {
  it('prefers the Workspace hd claim, lowercased with a leading @', () => {
    expect(
      resolveDomainFromClaims('Orono.K12.MN.US', 'teacher@elsewhere.com')
    ).toBe('@orono.k12.mn.us');
  });

  it('falls back to the email suffix when hd is absent', () => {
    expect(resolveDomainFromClaims(undefined, 'Teacher@Example.ORG')).toBe(
      '@example.org'
    );
  });

  it('ignores a blank/whitespace hd claim and uses the email', () => {
    expect(resolveDomainFromClaims('   ', 'a@b.com')).toBe('@b.com');
  });

  it('returns null when neither hd nor a usable email is present', () => {
    expect(resolveDomainFromClaims(undefined, undefined)).toBeNull();
    expect(resolveDomainFromClaims(undefined, 'no-at-sign')).toBeNull();
  });
});

describe('resolveOrgForUser callable', () => {
  const handler = resolveOrgForUser as unknown as Handler;

  beforeEach(() => {
    resolveOrgIdForDomainMock.mockReset();
  });

  it('rejects unauthenticated callers', async () => {
    await expect(handler({ auth: null, data: {} })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('resolves the org from the verified token domain', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    const res = await handler({
      auth: { token: { email: 'teacher@orono.k12.mn.us' } },
      data: {},
    });
    expect(res).toEqual({ orgId: 'orono' });
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledWith(
      expect.anything(),
      '@orono.k12.mn.us'
    );
  });

  it('returns orgId: null for an unregistered domain', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    const res = await handler({
      auth: { token: { email: 'someone@gmail.com' } },
      data: {},
    });
    expect(res).toEqual({ orgId: null });
  });

  it('returns orgId: null without a lookup when the token has no domain', async () => {
    const res = await handler({ auth: { token: {} }, data: {} });
    expect(res).toEqual({ orgId: null });
    expect(resolveOrgIdForDomainMock).not.toHaveBeenCalled();
  });

  it('never trusts a client-supplied domain in request.data', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    await handler({
      auth: { token: { email: 'a@gmail.com' } },
      data: { domain: '@orono.k12.mn.us', orgId: 'orono' },
    });
    // Resolution used the token's gmail.com domain, not the injected one.
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledWith(
      expect.anything(),
      '@gmail.com'
    );
  });
});
