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
  resolveDomainCandidates,
  resolveOrgForUser,
} from './resolveOrgForUser';

type Handler = (request: unknown) => Promise<{ orgId: string | null }>;

describe('resolveDomainCandidates', () => {
  it('orders the hd claim first, then the email domain (both lowercased)', () => {
    expect(
      resolveDomainCandidates('HD-Domain.com', 'teacher@Example.ORG')
    ).toEqual(['@hd-domain.com', '@example.org']);
  });

  it('falls back to only the email suffix when hd is absent', () => {
    expect(resolveDomainCandidates(undefined, 'Teacher@Example.ORG')).toEqual([
      '@example.org',
    ]);
  });

  it('ignores a blank/whitespace hd claim and uses the email', () => {
    expect(resolveDomainCandidates('   ', 'a@b.com')).toEqual(['@b.com']);
  });

  it('dedupes when hd equals the email domain (single lookup)', () => {
    expect(
      resolveDomainCandidates('orono.k12.mn.us', 'teacher@orono.k12.mn.us')
    ).toEqual(['@orono.k12.mn.us']);
  });

  it('returns an empty list when neither hd nor a usable email is present', () => {
    expect(resolveDomainCandidates(undefined, undefined)).toEqual([]);
    expect(resolveDomainCandidates(undefined, 'no-at-sign')).toEqual([]);
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

  it('falls back to the email domain when the hd domain is unregistered', async () => {
    // hd domain resolves to nothing; email domain resolves to an org.
    resolveOrgIdForDomainMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('orono');
    const res = await handler({
      auth: {
        token: { hd: 'alias-domain.com', email: 'teacher@orono.k12.mn.us' },
      },
      data: {},
    });
    expect(res).toEqual({ orgId: 'orono' });
    expect(resolveOrgIdForDomainMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      '@alias-domain.com'
    );
    expect(resolveOrgIdForDomainMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      '@orono.k12.mn.us'
    );
  });

  it('stops at the first registered domain (no second lookup)', async () => {
    resolveOrgIdForDomainMock.mockResolvedValueOnce('orono');
    const res = await handler({
      auth: {
        token: { hd: 'orono.k12.mn.us', email: 'teacher@alias-domain.com' },
      },
      data: {},
    });
    expect(res).toEqual({ orgId: 'orono' });
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledTimes(1);
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
