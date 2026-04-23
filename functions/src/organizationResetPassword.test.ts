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
  auth?: { uid: string; token: { email?: string } };
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
        auth: { uid: 'uid1', token: { email: 'admin@orono.k12.mn.us' } },
        data: { email: 'a@b.com' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects payloads missing email', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: { email: 'admin@orono.k12.mn.us' } },
        data: { orgId: 'orono' },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects non-object payloads', async () => {
    await expect(
      handler({
        auth: { uid: 'uid1', token: { email: 'admin@orono.k12.mn.us' } },
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

function buildFirestoreStub(opts: {
  emailEnabled: boolean;
  mailSet?: ReturnType<typeof vi.fn>;
}) {
  const mailSet = opts.mailSet ?? vi.fn().mockResolvedValue(undefined);
  return {
    collection: (col: string) => {
      if (col === 'organizations') {
        return {
          doc: () => ({
            collection: () => ({
              doc: (memberKey: string) => ({
                get: () =>
                  Promise.resolve(
                    memberKey === 'admin@orono.k12.mn.us'
                      ? ADMIN_DOC
                      : TARGET_DOC
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
      auth: { uid: 'uid1', token: { email: 'admin@orono.k12.mn.us' } },
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
      auth: { uid: 'uid1', token: { email: 'admin@orono.k12.mn.us' } },
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
        auth: { uid: 'uid1', token: { email: 'admin@orono.k12.mn.us' } },
        data: { orgId: 'orono', email: 'teacher@orono.k12.mn.us' },
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      message: expect.stringMatching(/claim.*invite/i),
    });
  });
});
