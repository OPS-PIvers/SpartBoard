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
  path,
  get: () => docGetMock(path) as Promise<unknown>,
  create: (data: unknown) => docCreateMock(path, data) as Promise<unknown>,
  update: (data: unknown, pre: unknown) =>
    docUpdateMock(path, data, pre) as Promise<unknown>,
}));

// Collection queries: mock-class membership, the matched domain doc and the member's invite tokens.
const mockClassHit = { value: false };
const domainRole: { value: string | undefined } = { value: 'primary' };
const inviteTokens: { value: Record<string, unknown>[] } = { value: [] };
const collectionMock = vi.fn((path: string) => {
  const query = {
    where: () => query,
    limit: () => query,
    get: () =>
      Promise.resolve(
        path.endsWith('/invitations')
          ? {
              docs: inviteTokens.value.map((t) => ({
                ref: { path: `${path}/${String(t.token)}` },
                get: (f: string) => t[f],
              })),
            }
          : path.endsWith('/testClasses')
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

// Sign-in activation commits the member and its open tokens in one batch.
const batchUpdateMock = vi.fn();
const batchCommitMock = vi.fn();
const batchMock = vi.fn(() => ({
  update: (ref: { path: string }, data: unknown, pre?: unknown) => {
    batchUpdateMock(ref.path, data, pre);
  },
  commit: () => batchCommitMock() as Promise<unknown>,
}));

// Auth account the deactivation claim lands on.
const authMock = {
  getUser: vi.fn(),
  getUserByEmail: vi.fn(),
  setCustomUserClaims: vi.fn(),
  revokeRefreshTokens: vi.fn(),
};

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: () => authMock,
  firestore: () => ({
    doc: docMock,
    collection: collectionMock,
    batch: batchMock,
  }),
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
    inviteTokens.value = [];
    batchUpdateMock.mockReset();
    batchCommitMock.mockReset();
    batchCommitMock.mockResolvedValue(undefined);
  });

  const scriptDocs = (opts: {
    memberExists: boolean;
    autoEnrollDomainUsers?: boolean;
    isAdmin?: boolean;
    member?: Record<string, unknown>;
    removed?: boolean;
  }): void => {
    docGetMock.mockImplementation((path: string) => {
      if (
        path ===
        'organizations/orono/removedMembers/new.teacher@orono.k12.mn.us'
      ) {
        return Promise.resolve({ exists: opts.removed === true });
      }
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
      const viewAsDoc = VIEW_AS_DOCS[path];
      if (viewAsDoc) {
        return Promise.resolve({
          exists: true,
          data: () => viewAsDoc,
          get: (field: string) => viewAsDoc[field],
        });
      }
      if (path === 'admin_settings/user_roles') {
        return Promise.resolve({ exists: false });
      }
      throw new Error('unexpected doc read: ' + path);
    });
  };
  const VIEW_AS_DOCS: Record<string, Record<string, unknown>> = {
    'view_as_sessions/s1': {
      by: 'boss@x',
      targetUid: 'uid-1',
      expiresAt: 9e15,
      endedAt: null,
    },
    'admin_settings/view_as': { enabled: true },
    'organizations/orono/members/boss@x': { roleId: 'super_admin' },
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

  it('does not re-enroll staff an admin removed from the org', async () => {
    scriptDocs({ memberExists: false, removed: true });
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
  });

  it('still flags a removed ClassLink student so they leave the teacher app', async () => {
    fetchOneRosterUsersMock.mockResolvedValue([{ role: 'student' }]);
    scriptDocs({ memberExists: false, removed: true });
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono', rosterStudent: true });
    expect(docCreateMock).not.toHaveBeenCalled();
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

  const TOKENS = 'organizations/orono/invitations';
  const LIVE = '2099-01-01T00:00:00.000Z';
  const PAST = '2020-01-01T00:00:00.000Z';

  it('marks an invited staff member active on sign-in, keeping role and buildings', async () => {
    scriptDocs({
      memberExists: true,
      member: { status: 'invited', roleId: 'teacher', buildingIds: ['b1'] },
    });
    const res = await handler({ auth: verifiedAuth, data: {} });
    expect(res).toEqual({ orgId: 'orono' });
    expect(docCreateMock).not.toHaveBeenCalled();
    expect(docUpdateMock).not.toHaveBeenCalled();
    const [path, data, pre] = batchUpdateMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
      unknown,
    ];
    expect(path).toBe(MEMBER_PATH);
    expect(Object.keys(data).sort()).toEqual(['lastActive', 'status', 'uid']);
    expect(data).toMatchObject({ status: 'active', uid: 'uid-1' });
    expect(pre).toEqual({ lastUpdateTime: 'T1' });
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it('claims the open, unexpired invite links in the same write as the activation', async () => {
    scriptDocs({
      memberExists: true,
      member: { status: 'invited', roleId: 'teacher' },
    });
    inviteTokens.value = [
      { token: 'live', expiresAt: LIVE },
      { token: 'old', expiresAt: PAST },
      { token: 'used', expiresAt: LIVE, claimedAt: PAST },
    ];
    await handler({ auth: verifiedAuth, data: {} });
    const paths = batchUpdateMock.mock.calls.map((c) => c[0] as string);
    expect(paths).toEqual([MEMBER_PATH, `${TOKENS}/live`]);
    expect(batchUpdateMock.mock.calls[1][1]).toMatchObject({
      claimedByUid: 'uid-1',
      claimedAt: expect.any(String) as string,
    });
  });

  it('still activates on sign-in when every invite link has expired, as before', async () => {
    scriptDocs({
      memberExists: true,
      member: { status: 'invited', roleId: 'teacher' },
    });
    inviteTokens.value = [{ token: 'old', expiresAt: PAST }];
    await handler({ auth: verifiedAuth, data: {} });
    expect(batchUpdateMock.mock.calls.map((c) => c[0] as string)).toEqual([
      MEMBER_PATH,
    ]);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it('activates a member an admin marked invited by hand (no invite link)', async () => {
    scriptDocs({
      memberExists: true,
      member: { status: 'invited', roleId: 'teacher' },
    });
    inviteTokens.value = [{ token: 'used', expiresAt: PAST, claimedAt: PAST }];
    await handler({ auth: verifiedAuth, data: {} });
    expect(batchUpdateMock.mock.calls.map((c) => c[0] as string)).toEqual([
      MEMBER_PATH,
    ]);
  });

  it('never activates a deactivated, student or already active member doc', async () => {
    for (const member of [
      { status: 'inactive', roleId: 'teacher' },
      { status: 'invited', roleId: 'student' },
      { status: 'active', roleId: 'teacher' },
    ]) {
      scriptDocs({ memberExists: true, member });
      inviteTokens.value = [{ token: 'live', expiresAt: LIVE }];
      await handler({ auth: verifiedAuth, data: {} });
    }
    expect(docUpdateMock).not.toHaveBeenCalled();
    expect(batchUpdateMock).not.toHaveBeenCalled();
  });

  it('stamps the deactivation claim on a deactivated member whose token lacks it', async () => {
    authMock.getUser.mockReset().mockResolvedValue({ uid: 'uid-1' });
    authMock.getUserByEmail.mockReset().mockResolvedValue({ uid: 'uid-1' });
    authMock.setCustomUserClaims.mockReset().mockResolvedValue(undefined);
    authMock.revokeRefreshTokens.mockReset().mockResolvedValue(undefined);
    scriptDocs({
      memberExists: true,
      member: { status: 'inactive', roleId: 'teacher' },
    });
    await handler({ auth: verifiedAuth, data: {} });
    expect(authMock.setCustomUserClaims).toHaveBeenCalledWith('uid-1', {
      deactivated: true,
    });
    expect(authMock.revokeRefreshTokens).toHaveBeenCalledWith('uid-1');

    authMock.setCustomUserClaims.mockClear();
    await handler({
      auth: {
        ...verifiedAuth,
        token: { ...verifiedAuth.token, deactivated: true },
      },
      data: {},
    });
    expect(authMock.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('clears a stale deactivation claim once the member doc is active again', async () => {
    authMock.getUser.mockReset().mockResolvedValue({
      uid: 'uid-1',
      customClaims: { deactivated: true },
    });
    authMock.getUserByEmail.mockReset().mockResolvedValue({
      uid: 'uid-1',
      customClaims: { deactivated: true },
    });
    authMock.setCustomUserClaims.mockReset().mockResolvedValue(undefined);
    scriptDocs({
      memberExists: true,
      member: { status: 'active', roleId: 'teacher' },
    });
    await handler({
      auth: {
        ...verifiedAuth,
        token: { ...verifiedAuth.token, deactivated: true },
      },
      data: {},
    });
    expect(authMock.setCustomUserClaims).toHaveBeenCalledWith('uid-1', {});
  });

  it('tells the client to refresh its token once a stale claim is cleared', async () => {
    authMock.getUser
      .mockReset()
      .mockResolvedValueOnce({
        uid: 'uid-1',
        customClaims: { deactivated: true },
      })
      .mockResolvedValue({ uid: 'uid-1', customClaims: {} });
    authMock.getUserByEmail.mockReset().mockResolvedValue({
      uid: 'uid-1',
      customClaims: { deactivated: true },
    });
    authMock.setCustomUserClaims.mockReset().mockResolvedValue(undefined);
    scriptDocs({
      memberExists: true,
      member: { status: 'active', roleId: 'teacher' },
    });
    const res = await handler({
      auth: {
        ...verifiedAuth,
        token: { ...verifiedAuth.token, deactivated: true },
      },
      data: {},
    });
    expect(res).toMatchObject({ orgId: 'orono', claimCleared: true });
  });

  describe('legacy self-enrolled docs', () => {
    const legacy = {
      status: 'active',
      roleId: 'teacher',
      addedBySource: 'auto-enroll:resolveOrgForUser',
    };

    it('demotes one ClassLink now lists as a student', async () => {
      fetchOneRosterUsersMock.mockResolvedValue([{ role: 'student' }]);
      scriptDocs({ memberExists: true, member: legacy });
      docUpdateMock.mockResolvedValue(undefined);
      const res = await handler({ auth: verifiedAuth, data: {} });
      expect(res).toEqual({ orgId: 'orono', rosterStudent: true });
      expect(docUpdateMock).toHaveBeenCalledWith(
        MEMBER_PATH,
        { roleId: 'student', demotedBy: 'resolveOrgForUser' },
        { lastUpdateTime: 'T1' }
      );
    });

    it('stamps ClassLink staff once and never asks again', async () => {
      scriptDocs({ memberExists: true, member: legacy });
      docUpdateMock.mockResolvedValue(undefined);
      expect(await handler({ auth: verifiedAuth, data: {} })).toEqual({
        orgId: 'orono',
      });
      expect(docUpdateMock).toHaveBeenCalledWith(
        MEMBER_PATH,
        { rosterRole: 'staff' },
        { lastUpdateTime: 'T1' }
      );
      fetchOneRosterUsersMock.mockClear();
      scriptDocs({
        memberExists: true,
        member: { ...legacy, rosterRole: 'staff' },
      });
      await handler({ auth: verifiedAuth, data: {} });
      expect(fetchOneRosterUsersMock).not.toHaveBeenCalled();
    });

    it('keeps the doc for an admin, a mock-class teacher, an unknown address or a ClassLink outage', async () => {
      fetchOneRosterUsersMock.mockResolvedValue([{ role: 'student' }]);
      scriptDocs({ memberExists: true, member: legacy, isAdmin: true });
      await handler({ auth: verifiedAuth, data: {} });

      fetchOneRosterUsersMock.mockResolvedValue([]);
      mockClassHit.value = true;
      scriptDocs({ memberExists: true, member: legacy });
      await handler({ auth: verifiedAuth, data: {} });

      fetchOneRosterUsersMock.mockRejectedValue(new Error('down'));
      await handler({ auth: verifiedAuth, data: {} });
      expect(docUpdateMock).not.toHaveBeenCalled();
    });

    it('leaves invited, admin-added and already-demoted docs alone', async () => {
      fetchOneRosterUsersMock.mockResolvedValue([{ role: 'student' }]);
      for (const member of [
        { status: 'active', roleId: 'teacher' },
        { ...legacy, roleId: 'student' },
        { ...legacy, roleId: 'domain_admin' },
      ]) {
        scriptDocs({ memberExists: true, member });
        await handler({ auth: verifiedAuth, data: {} });
      }
      expect(fetchOneRosterUsersMock).not.toHaveBeenCalled();
      expect(docUpdateMock).not.toHaveBeenCalled();
    });
  });

  it('ignores a lost race with an admin edit', async () => {
    scriptDocs({
      memberExists: true,
      member: { status: 'invited', roleId: 'teacher' },
    });
    batchCommitMock.mockRejectedValue(
      Object.assign(new Error('x'), { code: 9 })
    );
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
