import { describe, it, expect, vi, beforeEach } from 'vitest';

let docs: Record<string, Record<string, unknown>> = {};
const refreshMock =
  vi.fn<
    (
      uid: string,
      options?: { keepStoredOnFailure?: boolean }
    ) => Promise<{ accessToken: string; expiresIn: number }>
  >();

const { FakeTimestamp, HttpsError } = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(private ms: number) {}
    static fromMillis(ms: number) {
      return new FakeTimestamp(ms);
    }
    toMillis() {
      return this.ms;
    }
  }
  class HttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return { FakeTimestamp, HttpsError };
});

function snap(path: string) {
  const data = docs[path];
  return {
    exists: data !== undefined,
    data: () => data,
    get: (k: string) => data?.[k],
  };
}

const db = {
  doc: (path: string) => ({ get: () => Promise.resolve(snap(path)) }),
  collection: (name: string) => ({
    doc: (id: string) => ({
      get: () => Promise.resolve(snap(`${name}/${id}`)),
    }),
  }),
};

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'ts' },
    Timestamp: FakeTimestamp,
  }),
  auth: () => ({}),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_o: unknown, h: unknown) => h,
  HttpsError,
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./googleOAuth', () => ({
  GOOGLE_OAUTH_CLIENT_ID: {},
  GOOGLE_OAUTH_CLIENT_SECRET: {},
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY: {},
  refreshGoogleAccessTokenForUid: (
    uid: string,
    options?: { keepStoredOnFailure?: boolean }
  ) => refreshMock(uid, options),
}));

import { getViewAsDriveTokenV1 } from './viewAsDrive';

type Handler = (r: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
}) => Promise<Record<string, unknown>>;
const getToken = getViewAsDriveTokenV1 as unknown as Handler;

const boss = 'boss@orono.k12.mn.us';
const later = () => Date.now() + 30 * 60 * 1000;

function viewAsAuth(claim: Record<string, unknown> = {}) {
  return {
    uid: 'jane-uid',
    token: {
      viewAs: {
        by: boss,
        sid: 's1',
        ro: true,
        adminTarget: false,
        exp: later(),
        ...claim,
      },
    },
  };
}

beforeEach(() => {
  docs = {
    'admin_settings/view_as': { enabled: true },
    [`organizations/orono/members/${boss}`]: { roleId: 'super_admin' },
    'view_as_sessions/s1': {
      by: boss,
      targetEmail: 'jane@orono.k12.mn.us',
      targetUid: 'jane-uid',
      adminTarget: false,
      unlocked: false,
      expiresAt: FakeTimestamp.fromMillis(later()),
      endedAt: null,
    },
  };
  refreshMock
    .mockReset()
    .mockResolvedValue({ accessToken: 'drive-tok', expiresIn: 3599 });
});

describe('getViewAsDriveTokenV1', () => {
  it('returns the target token from a read-only session without touching their grant', async () => {
    const res = await getToken({ auth: viewAsAuth(), data: {} });
    expect(res).toEqual({
      available: true,
      accessToken: 'drive-tok',
      expiresIn: 3599,
    });
    expect(refreshMock).toHaveBeenCalledWith('jane-uid', {
      keepStoredOnFailure: true,
    });
  });

  it('reports unavailable when the target has no stored grant', async () => {
    refreshMock.mockRejectedValue(
      new HttpsError('failed-precondition', 'needs-consent', {
        reason: 'needs-consent',
        cause: 'no-stored-token',
      })
    );
    const res = await getToken({ auth: viewAsAuth(), data: {} });
    expect(res).toEqual({ available: false });
  });

  it('rethrows transient failures', async () => {
    refreshMock.mockRejectedValue(
      new HttpsError('internal', 'blip', { reason: 'transient' })
    );
    await expect(getToken({ auth: viewAsAuth(), data: {} })).rejects.toThrow(
      'blip'
    );
  });

  it('refuses an ordinary token', async () => {
    await expect(
      getToken({ auth: { uid: 'jane-uid', token: {} }, data: {} })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('refuses an expired claim', async () => {
    await expect(
      getToken({ auth: viewAsAuth({ exp: Date.now() - 1 }), data: {} })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('refuses an ended session', async () => {
    docs['view_as_sessions/s1'].endedAt = 'ts';
    await expect(
      getToken({ auth: viewAsAuth(), data: {} })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses a session for a different target', async () => {
    docs['view_as_sessions/s1'].targetUid = 'someone-else';
    await expect(
      getToken({ auth: viewAsAuth(), data: {} })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses when the kill switch is off', async () => {
    docs['admin_settings/view_as'] = { enabled: false };
    await expect(
      getToken({ auth: viewAsAuth(), data: {} })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('refuses when the admin is no longer a super admin', async () => {
    docs[`organizations/orono/members/${boss}`] = { roleId: 'teacher' };
    await expect(
      getToken({ auth: viewAsAuth(), data: {} })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
