import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks let individual tests reconfigure firestore + auth behavior
// per scenario (admin check, member lookup, email config, link minting).
const generatePasswordResetLinkMock = vi.fn();
const firestoreMock = vi.fn();

vi.mock('firebase-admin', () => {
  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    firestore: () => firestoreMock(),
    auth: () => ({
      generatePasswordResetLink: generatePasswordResetLinkMock,
    }),
  };
});

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

import { resetOrganizationUserPassword } from './organizationResetPassword';

type CallableHandler = (request: {
  auth?: { uid: string; token: { email?: string; email_verified?: boolean } };
  data: unknown;
}) => Promise<unknown>;

const handler = resetOrganizationUserPassword as unknown as CallableHandler;

describe('resetOrganizationUserPassword — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated callers', async () => {
    await expect(
      handler({ data: { orgId: 'orono', email: 'a@b.com' } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects callers without an email claim', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: {} },
        data: { orgId: 'orono', email: 'a@b.com' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects payloads missing orgId', async () => {
    await expect(
      handler({
        auth: {
          uid: 'uid1',
          token: { email: 'admin@orono.k12.mn.us', email_verified: true },
        },
        data: { email: 'a@b.com' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects payloads missing email', async () => {
    await expect(
      handler({
        auth: {
          uid: 'uid1',
          token: { email: 'admin@orono.k12.mn.us', email_verified: true },
        },
        data: { orgId: 'orono' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects non-object payloads', async () => {
    await expect(
      handler({
        auth: {
          uid: 'uid1',
          token: { email: 'admin@orono.k12.mn.us', email_verified: true },
        },
        data: 'not-an-object',
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

// --- Response-shape tests (email queue enabled vs. disabled) ----------------
//
// These exercise the actual handler body, so we stub firestore() with just
// enough surface to cover:
//   1. caller member doc lookup (admin role check)
//   2. target member doc lookup (must exist)
//   3. global_permissions/invite-emails read (toggles email send)
//   4. mail/{id} set (the audit-trail write)
// The shape mirrors what the production firestore client exposes; any extra
// chained methods are stubbed inline as the test needs them.

interface DocStub {
  exists: boolean;
  data: () => Record<string, unknown>;
}

const ADMIN_DOC: DocStub = {
  exists: true,
  data: () => ({
    roleId: 'domain_admin',
    buildingIds: [] as string[],
  }),
};

const TARGET_DOC: DocStub = {
  exists: true,
  data: () => ({
    roleId: 'teacher',
    buildingIds: [] as string[],
  }),
};

const memberDoc = (roleId: string): DocStub => ({
  exists: true,
  data: () => ({ roleId, buildingIds: [] as string[] }),
});

function buildFirestoreStub(opts: {
  emailEnabled: boolean;
  mailSet?: ReturnType<typeof vi.fn>;
  callerRole?: string;
  targetRole?: string;
  legacySuperAdmins?: string[];
  callerEmail?: string;
  // Caller's operator-org roleId for isStrictSuperAdmin(); null = no operator membership.
  callerOperatorRole?: string | null;
  verifiedDomains?: Record<string, string | string[]>;
}) {
  const mailSet = opts.mailSet ?? vi.fn().mockResolvedValue(undefined);
  const callerDoc = opts.callerRole ? memberDoc(opts.callerRole) : ADMIN_DOC;
  const targetDoc = opts.targetRole ? memberDoc(opts.targetRole) : TARGET_DOC;
  const callerEmail = opts.callerEmail ?? 'admin@orono.k12.mn.us';
  const verifiedDomains = opts.verifiedDomains ?? {
    '@orono.k12.mn.us': 'orono',
  };
  const roleOf = (email: string) =>
    email === callerEmail
      ? (callerDoc.data().roleId as string)
      : (targetDoc.data().roleId as string);
  return {
    // isStrictSuperAdmin(): operator-org member doc and legacy user_roles list.
    doc: (path: string) => ({
      get: () => {
        if (path === 'admin_settings/user_roles') {
          return Promise.resolve({
            exists: true,
            get: () => opts.legacySuperAdmins ?? [],
          });
        }
        const email = path.split('/').pop() ?? '';
        if (email === callerEmail && opts.callerOperatorRole !== undefined) {
          const role = opts.callerOperatorRole;
          return Promise.resolve({ exists: role !== null, get: () => role });
        }
        return Promise.resolve({ exists: true, get: () => roleOf(email) });
      },
    }),
    // Verified domain docs, keyed '@domain' -> owning orgId(s).
    collectionGroup: () => ({
      where: (_f: string, _op: string, domain: string) => ({
        where: () => ({
          get: () => {
            const docs = ([] as string[])
              .concat(verifiedDomains[domain] ?? [])
              .map((id) => ({ ref: { parent: { parent: { id } } } }));
            return Promise.resolve({ empty: docs.length === 0, docs });
          },
        }),
      }),
    }),
    collection: (col: string) => {
      if (col === 'organizations') {
        return {
          doc: () => ({
            collection: () => ({
              doc: (memberKey: string) => ({
                get: () =>
                  Promise.resolve(
                    memberKey === callerEmail ? callerDoc : targetDoc
                  ),
              }),
            }),
          }),
        };
      }
      if (col === 'global_permissions') {
        return {
          doc: () => ({
            get: () =>
              Promise.resolve({
                exists: true,
                data: () => ({ enabled: opts.emailEnabled }),
              }),
          }),
        };
      }
      if (col === 'mail') {
        return {
          doc: () => ({ set: mailSet }),
        };
      }
      throw new Error(`Unexpected collection access: ${col}`);
    },
  };
}

describe('resetOrganizationUserPassword — response shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('email enabled + queue write succeeds → sent:true and no resetUrl', async () => {
    const mailSet = vi.fn().mockResolvedValue(undefined);
    firestoreMock.mockReturnValue(
      buildFirestoreStub({ emailEnabled: true, mailSet })
    );
    generatePasswordResetLinkMock.mockResolvedValue(
      'https://example.com/reset?token=abc'
    );

    const result = await handler({
      auth: {
        uid: 'uid1',
        token: { email: 'admin@orono.k12.mn.us', email_verified: true },
      },
      data: { orgId: 'orono', email: 'teacher@orono.k12.mn.us' },
    });

    expect(result).toEqual({
      sent: true,
      email: 'teacher@orono.k12.mn.us',
    });
    // resetUrl must NOT be present when the queue handled delivery — admins
    // should rely on the audit trail, not bypass it via copy/paste.
    expect((result as { resetUrl?: string }).resetUrl).toBeUndefined();
    expect(mailSet).toHaveBeenCalledOnce();
  });

  it('email disabled → sent:false and resetUrl populated for manual delivery', async () => {
    const mailSet = vi.fn();
    firestoreMock.mockReturnValue(
      buildFirestoreStub({ emailEnabled: false, mailSet })
    );
    const mintedUrl = 'https://example.com/reset?token=xyz';
    generatePasswordResetLinkMock.mockResolvedValue(mintedUrl);

    const result = (await handler({
      auth: {
        uid: 'uid1',
        token: { email: 'admin@orono.k12.mn.us', email_verified: true },
      },
      data: { orgId: 'orono', email: 'teacher@orono.k12.mn.us' },
    })) as { sent: boolean; email: string; resetUrl?: string };

    expect(result.sent).toBe(false);
    expect(result.email).toBe('teacher@orono.k12.mn.us');
    expect(typeof result.resetUrl).toBe('string');
    expect(result.resetUrl).toBe(mintedUrl);
    expect(mailSet).not.toHaveBeenCalled();
  });

  it('auth/user-not-found from generatePasswordResetLink → failed-precondition with claim-invite hint', async () => {
    firestoreMock.mockReturnValue(buildFirestoreStub({ emailEnabled: false }));
    const err = Object.assign(new Error('not found'), {
      code: 'auth/user-not-found',
    });
    generatePasswordResetLinkMock.mockRejectedValue(err);

    await expect(
      handler({
        auth: {
          uid: 'uid1',
          token: { email: 'admin@orono.k12.mn.us', email_verified: true },
        },
        data: { orgId: 'orono', email: 'teacher@orono.k12.mn.us' },
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      message: expect.stringMatching(/claim.*invite/i),
    });
  });
});

// Regression: an attacker who self-registers (email/password sign-in) with a
// real admin's address, without ever verifying it, must not be able to mint —
// and, with the email queue disabled, receive directly in the response — a
// password-reset link for another org member. Sibling fix to
// resolveOrgForUser.ts (#2884) and firestore.rules isAdmin() (#2915).
describe('resetOrganizationUserPassword — email verification gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unverified caller impersonating a real admin email, before minting a reset link', async () => {
    firestoreMock.mockReturnValue(buildFirestoreStub({ emailEnabled: false }));
    generatePasswordResetLinkMock.mockResolvedValue(
      'https://example.com/reset?token=stolen'
    );

    await expect(
      handler({
        auth: {
          uid: 'attacker-uid',
          token: { email: 'admin@orono.k12.mn.us' },
        },
        data: { orgId: 'orono', email: 'teacher@orono.k12.mn.us' },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(generatePasswordResetLinkMock).not.toHaveBeenCalled();
  });
});

// A domain admin must not be able to take over a super admin's account by
// minting (and, with the email queue off, receiving) their reset link.
describe('resetOrganizationUserPassword — role check on the target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generatePasswordResetLinkMock.mockResolvedValue(
      'https://example.com/reset?token=abc'
    );
  });

  const call = () =>
    handler({
      auth: {
        uid: 'uid1',
        token: { email: 'admin@orono.k12.mn.us', email_verified: true },
      },
      data: { orgId: 'orono', email: 'boss@orono.k12.mn.us' },
    });

  it('domain admin cannot reset a super_admin member', async () => {
    firestoreMock.mockReturnValue(
      buildFirestoreStub({
        emailEnabled: false,
        callerRole: 'domain_admin',
        targetRole: 'super_admin',
      })
    );
    await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(generatePasswordResetLinkMock).not.toHaveBeenCalled();
  });

  it('domain admin cannot reset a legacy-list super admin', async () => {
    firestoreMock.mockReturnValue(
      buildFirestoreStub({
        emailEnabled: false,
        callerRole: 'domain_admin',
        targetRole: 'domain_admin',
        legacySuperAdmins: ['boss@orono.k12.mn.us'],
      })
    );
    await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(generatePasswordResetLinkMock).not.toHaveBeenCalled();
  });

  it('super admin can reset a super_admin member', async () => {
    firestoreMock.mockReturnValue(
      buildFirestoreStub({
        emailEnabled: false,
        callerRole: 'super_admin',
        targetRole: 'super_admin',
      })
    );
    await expect(call()).resolves.toMatchObject({ sent: false });
  });

  it('legacy-list super admin with a domain_admin member doc can reset a super admin', async () => {
    firestoreMock.mockReturnValue(
      buildFirestoreStub({
        emailEnabled: false,
        callerRole: 'domain_admin',
        targetRole: 'super_admin',
        legacySuperAdmins: ['admin@orono.k12.mn.us'],
      })
    );
    await expect(call()).resolves.toMatchObject({ sent: false });
  });

  it('domain admin can still reset a domain_admin member', async () => {
    firestoreMock.mockReturnValue(
      buildFirestoreStub({
        emailEnabled: false,
        callerRole: 'domain_admin',
        targetRole: 'domain_admin',
      })
    );
    await expect(call()).resolves.toMatchObject({ sent: false });
  });
});

// Auth accounts are global, so a planted member doc must not unlock another org's account.
describe('resetOrganizationUserPassword — target must be on a verified org domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generatePasswordResetLinkMock.mockResolvedValue(
      'https://example.com/reset?token=abc'
    );
  });

  const call = (orgId: string, email: string, callerEmail: string) =>
    handler({
      auth: {
        uid: 'uid1',
        token: { email: callerEmail, email_verified: true },
      },
      data: { orgId, email },
    });

  it.each([false, true])(
    "another org's domain admin cannot reset an Orono account it enrolled (email enabled: %s)",
    async (emailEnabled) => {
      const mailSet = vi.fn().mockResolvedValue(undefined);
      firestoreMock.mockReturnValue(
        buildFirestoreStub({
          emailEnabled,
          mailSet,
          callerEmail: 'admin@district-b.org',
          callerRole: 'domain_admin',
          callerOperatorRole: null,
          verifiedDomains: {
            '@orono.k12.mn.us': 'orono',
            '@district-b.org': 'district-b',
          },
        })
      );
      await expect(
        call('district-b', 'teacher@orono.k12.mn.us', 'admin@district-b.org')
      ).rejects.toMatchObject({ code: 'permission-denied' });
      expect(generatePasswordResetLinkMock).not.toHaveBeenCalled();
      expect(mailSet).not.toHaveBeenCalled();
    }
  );

  it('another org that also claims the Orono domain as verified cannot reset an Orono account', async () => {
    firestoreMock.mockReturnValue(
      buildFirestoreStub({
        emailEnabled: false,
        callerEmail: 'admin@district-b.org',
        callerRole: 'domain_admin',
        callerOperatorRole: null,
        verifiedDomains: { '@orono.k12.mn.us': ['district-b', 'orono'] },
      })
    );
    await expect(
      call('district-b', 'teacher@orono.k12.mn.us', 'admin@district-b.org')
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(generatePasswordResetLinkMock).not.toHaveBeenCalled();
  });

  it("an org-level super_admin outside the operator org cannot reset another org's account", async () => {
    firestoreMock.mockReturnValue(
      buildFirestoreStub({
        emailEnabled: false,
        callerEmail: 'admin@district-b.org',
        callerRole: 'super_admin',
        callerOperatorRole: null,
      })
    );
    await expect(
      call('district-b', 'teacher@orono.k12.mn.us', 'admin@district-b.org')
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(generatePasswordResetLinkMock).not.toHaveBeenCalled();
  });

  it('a domain admin cannot reset a member whose domain is not verified for the org', async () => {
    firestoreMock.mockReturnValue(buildFirestoreStub({ emailEnabled: false }));
    await expect(
      call('orono', 'someone@gmail.com', 'admin@orono.k12.mn.us')
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(generatePasswordResetLinkMock).not.toHaveBeenCalled();
  });

  it('a strict super admin can still reset an out-of-domain member', async () => {
    firestoreMock.mockReturnValue(
      buildFirestoreStub({ emailEnabled: false, callerRole: 'super_admin' })
    );
    await expect(
      call('orono', 'someone@gmail.com', 'admin@orono.k12.mn.us')
    ).resolves.toMatchObject({ sent: false });
    expect(generatePasswordResetLinkMock).toHaveBeenCalledWith(
      'someone@gmail.com'
    );
  });
});
