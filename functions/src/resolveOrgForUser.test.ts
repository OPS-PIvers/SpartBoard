import { describe, it, expect, vi, beforeEach } from 'vitest';

// Resolve-org lookup is the only Firestore touch; mock it so the callable
// tests stay pure. The pure `resolveDomainFromClaims` helper needs no mocks.
const resolveOrgIdForDomainMock = vi.fn();

// Path-keyed doc mock so auto-enroll's member/org reads and the member
// create can be scripted per test.
const docGetMock = vi.fn();
const docCreateMock = vi.fn();
const docUpdateMock = vi.fn();
const docMock = vi.fn((path: string) => ({
  get: () => docGetMock(path) as Promise<unknown>,
  create: (data: unknown) => docCreateMock(path, data) as Promise<unknown>,
  update: (data: unknown, pre: unknown) =>
    docUpdateMock(path, data, pre) as Promise<unknown>,
}));

// Collection queries: mock-class membership and the matched domain doc.
const mockClassHit = { value: false };
const domainRole: { value: string | undefined } = { value: 'primary' };
const collectionMock = vi.fn((path: string) => {
  const query = {
    where: () => query,
    limit: () => query,
    get: () =>
      Promise.resolve(
        path.endsWith('/testClasses')
          ? { empty: !mockClassHit.value }
          : {
              empty: false,
              docs: [
                {
                  get: (f: string) =>
                    f === 'role' ? domainRole.value : undefined,
                },
              ],
            }
      ),
  };
  return query;
});

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: () => ({ doc: docMock, collection: collectionMock }),
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
  isSafeEmailForOneRosterFilter: (email: string) => !email.includes("'"),
}));

// Students share the staff domain; auto-enroll needs ClassLink (or a staff-only domain) to vouch for staff.
const fetchOneRosterUsersMock = vi.fn();
vi.mock('./studentEmailIdentity', () => ({
  fetchOneRosterUsersByEmail: (...args: unknown[]): Promise<unknown> =>
    fetchOneRosterUsersMock(...args) as Promise<unknown>,
  isOneRosterStaff: (u: { role?: string }) => u.role === 'teacher',
  isOneRosterStudent: (u: { role?: string }) => u.role === 'student',
}));
vi.mock('./secrets', () => {
  const secret = (v: string) => ({ value: () => v });
  return {
    CLASSLINK_CLIENT_ID: secret('cl-id'),
    CLASSLINK_CLIENT_SECRET: secret('cl-secret'),
    CLASSLINK_TENANT_URL: secret('https://tenant.example'),
  };
});

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
    // Resolution tests: the caller is already a member, so nothing enrolls.
    docGetMock.mockResolvedValue({ exists: true, get: () => 'active' });
    docCreateMock.mockReset();
    docUpdateMock.mockReset();
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
      auth: {
        token: { email: 'teacher@orono.k12.mn.us', email_verified: true },
      },
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
      auth: { token: { email: 'someone@gmail.com', email_verified: true } },
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
        token: {
          hd: 'alias-domain.com',
          email: 'teacher@orono.k12.mn.us',
          email_verified: true,
        },
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
        token: {
          hd: 'orono.k12.mn.us',
          email: 'teacher@alias-domain.com',
          email_verified: true,
        },
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
      auth: { token: { email: 'a@gmail.com', email_verified: true } },
      data: { domain: '@orono.k12.mn.us', orgId: 'orono' },
    });
    // Resolution used the token's gmail.com domain, not the injected one.
    expect(resolveOrgIdForDomainMock).toHaveBeenCalledWith(
      expect.anything(),
      '@gmail.com'
    );
  });

  // Regression: an unverified claim must never resolve an org, even at a registered domain.
  it('never resolves an org for an unverified email, even at a registered domain', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    const res = await handler({
      auth: { token: { email: 'unverified@orono.k12.mn.us' } },
      data: {},
    });
    expect(res).toEqual({ orgId: null });
    expect(resolveOrgIdForDomainMock).not.toHaveBeenCalled();
  });

  it('never resolves an org for an unverified hd claim', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    const res = await handler({
      auth: {
        token: {
          hd: 'orono.k12.mn.us',
          email: 'unverified@orono.k12.mn.us',
          email_verified: false,
        },
      },
      data: {},
    });
    expect(res).toEqual({ orgId: null });
    expect(resolveOrgIdForDomainMock).not.toHaveBeenCalled();
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
    docUpdateMock.mockReset();
    docMock.mockClear();
    resolveOrgIdForDomainMock.mockResolvedValue('orono');
    fetchOneRosterUsersMock.mockReset();
    fetchOneRosterUsersMock.mockResolvedValue([{ role: 'teacher' }]);
    mockClassHit.value = false;
    domainRole.value = 'primary';
  });

  const scriptDocs = (opts: {
    memberExists: boolean;
    autoEnrollDomainUsers?: boolean;
    isAdmin?: boolean;
    member?: Record<string, unknown>;
  }): void => {
    docGetMock.mockImplementation((path: string) => {
      if (path === 'admins/new.teacher@orono.k12.mn.us') {
        return Promise.resolve({ exists: opts.isAdmin === true });
      }
      if (path === MEMBER_PATH) {
        const member = opts.member ?? {};
        return Promise.resolve({
          exists: opts.memberExists,
          updateTime: 'T1',
          get: (field: string) => member[field],
        });
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

  it('never enrolls a ClassLink student, but still resolves', async () => {
    scriptDocs({ memberExists: false });
    fetchOneRosterUsersMock.mockResolvedValue([{ role: 'student' }]);
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono', rosterStudent: true });
    expect(fetchOneRosterUsersMock).toHaveBeenCalledWith(
      'new.teacher@orono.k12.mn.us',
      {
        classlinkClientId: 'cl-id',
        classlinkClientSecret: 'cl-secret',
        tenantUrl: 'https://tenant.example',
      },
      8000
    );
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('never enrolls a mock-class student ClassLink does not list as staff', async () => {
    scriptDocs({ memberExists: false });
    mockClassHit.value = true;
    fetchOneRosterUsersMock.mockResolvedValue([]);
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono', rosterStudent: true });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('never enrolls an address ClassLink does not know on a shared domain', async () => {
    scriptDocs({ memberExists: false });
    fetchOneRosterUsersMock.mockResolvedValue([]);
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('never enrolls anyone on a domain registered for students', async () => {
    scriptDocs({ memberExists: false });
    domainRole.value = 'student';
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(fetchOneRosterUsersMock).not.toHaveBeenCalled();
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it("never enrolls an unknown address on a domain marked staff (the admin panel's default)", async () => {
    scriptDocs({ memberExists: false });
    domainRole.value = 'staff';
    fetchOneRosterUsersMock.mockResolvedValue([]);
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('enrolls an address on the admin list that ClassLink does not know', async () => {
    scriptDocs({ memberExists: false, isAdmin: true });
    fetchOneRosterUsersMock.mockResolvedValue([]);
    docCreateMock.mockResolvedValue(undefined);
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).toHaveBeenCalled();
  });

  it('never enrolls a ClassLink student even on the admin list', async () => {
    scriptDocs({ memberExists: false, isAdmin: true });
    fetchOneRosterUsersMock.mockResolvedValue([{ role: 'student' }]);
    const res = await handler({ auth: verifiedAuth, data: {} });
    // An admin is never sent to the student page.
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('keeps an admin in a mock class in the teacher app when ClassLink is down', async () => {
    scriptDocs({ memberExists: false, isAdmin: true });
    mockClassHit.value = true;
    fetchOneRosterUsersMock.mockRejectedValue(new Error('roster down'));
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('skips enrollment when ClassLink cannot answer, so the next load retries', async () => {
    scriptDocs({ memberExists: false });
    fetchOneRosterUsersMock.mockRejectedValue(new Error('roster down'));
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono', enrollFailed: true });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('resolves but never enrolls from a View as tab', async () => {
    scriptDocs({ memberExists: false });
    const viewAs = { by: 'boss@x', sid: 's1', ro: true, adminTarget: false };
    const res = await handler({
      auth: {
        ...verifiedAuth,
        token: { ...verifiedAuth.token, viewAs: { ...viewAs, exp: 9e15 } },
      },
      data: {},
    });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('never touches an existing member doc', async () => {
    scriptDocs({ memberExists: true });
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
    expect(docUpdateMock).not.toHaveBeenCalled();
  });

  it('marks an invited staff member active on sign-in, keeping role and buildings', async () => {
    scriptDocs({
      memberExists: true,
      member: { status: 'invited', roleId: 'teacher', buildingIds: ['b1'] },
    });
    docUpdateMock.mockResolvedValue(undefined);
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
    const [path, data, pre] = docUpdateMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
      unknown,
    ];
    expect(path).toBe(MEMBER_PATH);
    expect(Object.keys(data).sort()).toEqual(['lastActive', 'status', 'uid']);
    expect(data).toMatchObject({ status: 'active', uid: 'uid-1' });
    expect(pre).toEqual({ lastUpdateTime: 'T1' });
  });

  it('never activates a deactivated, student or already active member doc', async () => {
    for (const member of [
      { status: 'inactive', roleId: 'teacher' },
      { status: 'invited', roleId: 'student' },
      { status: 'active', roleId: 'teacher' },
    ]) {
      scriptDocs({ memberExists: true, member });
      await handler({ auth: verifiedAuth, data: {} });
    }
    expect(docUpdateMock).not.toHaveBeenCalled();
  });

  it('ignores a lost race with an admin edit', async () => {
    scriptDocs({
      memberExists: true,
      member: { status: 'invited', roleId: 'teacher' },
    });
    docUpdateMock.mockRejectedValue(Object.assign(new Error('x'), { code: 9 }));
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
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

  it('skips unverified emails — and never resolves an org for them either', async () => {
    const res = await handler({
      auth: {
        uid: 'uid-3',
        token: { email: 'teacher@orono.k12.mn.us' },
      },
      data: {},
    });
    // Regression: must not resolve an org at all, not just skip auto-enrollment.
    expect(res).toEqual({ orgId: null });
    expect(resolveOrgIdForDomainMock).not.toHaveBeenCalled();
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
    expect(res).toEqual({ orgId: 'orono', enrollFailed: true });
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
