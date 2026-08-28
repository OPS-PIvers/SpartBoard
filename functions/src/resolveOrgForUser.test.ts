import { describe, it, expect, vi, beforeEach } from 'vitest';

// Resolve-org lookup is the only Firestore touch; mock it so the callable
// tests stay pure. The pure `resolveDomainFromClaims` helper needs no mocks.
const resolveOrgIdForDomainMock = vi.fn();

// Path-keyed doc mock so auto-enroll's member/org reads and the member
// create can be scripted per test.
const docGetMock = vi.fn();
const docCreateMock = vi.fn();
const docMock = vi.fn((path: string) => ({
  get: () => docGetMock(path) as Promise<unknown>,
  create: (data: unknown) => docCreateMock(path, data) as Promise<unknown>,
}));

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: () => ({ doc: docMock }),
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
  isAutoEnrollableEmail,
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

describe('isAutoEnrollableEmail', () => {
  it('accepts a normal firstname.lastname address', () => {
    expect(isAutoEnrollableEmail('paul.ivers@orono.k12.mn.us')).toBe(true);
  });

  it('rejects student-ID-shaped (all-digit local) addresses', () => {
    expect(isAutoEnrollableEmail('704522@orono.k12.mn.us')).toBe(false);
  });

  it('rejects an empty local part', () => {
    expect(isAutoEnrollableEmail('@orono.k12.mn.us')).toBe(false);
  });
});

describe('resolveOrgForUser callable', () => {
  const handler = resolveOrgForUser as unknown as Handler;

  beforeEach(() => {
    resolveOrgIdForDomainMock.mockReset();
    docGetMock.mockReset();
    docCreateMock.mockReset();
    docMock.mockClear();
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

describe('resolveOrgForUser auto-enrollment', () => {
  const handler = resolveOrgForUser as unknown as Handler;
  const MEMBER_PATH = 'organizations/orono/members/new.teacher@orono.k12.mn.us';
  const ORG_PATH = 'organizations/orono';

  const verifiedAuth = {
    uid: 'uid-1',
    token: {
      email: 'New.Teacher@orono.k12.mn.us',
      email_verified: true,
      name: 'New Teacher',
    },
  };

  beforeEach(() => {
    resolveOrgIdForDomainMock.mockReset();
    docGetMock.mockReset();
    docCreateMock.mockReset();
    docMock.mockClear();
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
  });

  const scriptDocs = (opts: {
    memberExists: boolean;
    autoEnrollDomainUsers?: boolean;
  }): void => {
    docGetMock.mockImplementation((path: string) => {
      if (path === MEMBER_PATH) {
        return Promise.resolve({ exists: opts.memberExists });
      }
      if (path === ORG_PATH) {
        return Promise.resolve({
          exists: true,
          get: (field: string) =>
            field === 'autoEnrollDomainUsers'
              ? opts.autoEnrollDomainUsers
              : undefined,
        });
      }
      throw new Error('unexpected doc read: ' + path);
    });
  };

  it('creates an active teacher member doc on first verified sign-in', async () => {
    scriptDocs({ memberExists: false });
    docCreateMock.mockResolvedValue(undefined);

    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).toHaveBeenCalledWith(MEMBER_PATH, {
      email: 'new.teacher@orono.k12.mn.us',
      orgId: 'orono',
      roleId: 'teacher',
      buildingIds: [],
      status: 'active',
      name: 'New Teacher',
      uid: 'uid-1',
      addedBySource: 'auto-enroll:resolveOrgForUser',
    });
  });

  it('never touches an existing member doc', async () => {
    scriptDocs({ memberExists: true });
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('skips student-ID-shaped emails entirely', async () => {
    const res = await handler({
      auth: {
        uid: 'uid-2',
        token: { email: '704522@orono.k12.mn.us', email_verified: true },
      },
      data: {},
    });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docMock).not.toHaveBeenCalled();
  });

  it('skips unverified emails', async () => {
    const res = await handler({
      auth: {
        uid: 'uid-3',
        token: { email: 'teacher@orono.k12.mn.us' },
      },
      data: {},
    });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docMock).not.toHaveBeenCalled();
  });

  it('honors an org-level autoEnrollDomainUsers: false opt-out', async () => {
    scriptDocs({ memberExists: false, autoEnrollDomainUsers: false });
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('still resolves the org when the member write fails', async () => {
    scriptDocs({ memberExists: false });
    docCreateMock.mockRejectedValue(
      Object.assign(new Error('unavailable'), { code: 14 })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('swallows an ALREADY_EXISTS create race silently', async () => {
    scriptDocs({ memberExists: false });
    docCreateMock.mockRejectedValue(
      Object.assign(new Error('already exists'), { code: 6 })
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
