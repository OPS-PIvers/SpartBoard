import { describe, it, expect, vi, beforeEach } from 'vitest';

const { FakeTimestamp } = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(private ms: number) {}
    toMillis() {
      return this.ms;
    }
  }
  return { FakeTimestamp };
});

let docs: Record<string, Record<string, unknown>> = {};
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

vi.mock('./firebaseAdmin', () => ({
  firestore: Object.assign(() => db, { Timestamp: FakeTimestamp }),
}));
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { HttpsError };
});

import { assertViewAsAllowed, readViewAsClaim } from './viewAsGuard';

const NOW = 1_000_000;
const req = (viewAs?: unknown) => ({
  auth: { uid: 'u', token: viewAs === undefined ? {} : { viewAs } },
});
const claim = (over: Record<string, unknown> = {}) => ({
  by: 'boss@x',
  sid: 's1',
  ro: true,
  adminTarget: false,
  exp: NOW + 1000,
  ...over,
});

beforeEach(() => {
  docs = {
    'admin_settings/view_as': { enabled: true },
    'organizations/orono/members/boss@x': {
      roleId: 'super_admin',
      status: 'active',
    },
    'view_as_sessions/s1': {
      by: 'boss@x',
      targetUid: 'u',
      expiresAt: new FakeTimestamp(NOW + 1000),
      endedAt: null,
    },
  };
});

describe('assertViewAsAllowed', () => {
  it('lets an ordinary token through untouched', async () => {
    docs = {};
    await expect(assertViewAsAllowed(req(), {}, NOW)).resolves.toBeNull();
    await expect(
      assertViewAsAllowed({ auth: null }, {}, NOW)
    ).resolves.toBeNull();
  });

  it('lets a live read-only claim run a read callable', async () => {
    const c = await assertViewAsAllowed(req(claim()), { read: true }, NOW);
    expect(c?.sid).toBe('s1');
  });

  it('refuses writes and outward actions while read-only', async () => {
    await expect(assertViewAsAllowed(req(claim()), {}, NOW)).rejects.toThrow(
      'Unlock edits'
    );
    await expect(
      assertViewAsAllowed(req(claim()), { outward: true, read: true }, NOW)
    ).rejects.toThrow('Unlock edits');
  });

  it('allows writes once unlocked', async () => {
    await expect(
      assertViewAsAllowed(req(claim({ ro: false })), { outward: true }, NOW)
    ).resolves.not.toBeNull();
  });

  it('refuses everything after exp, even reads', async () => {
    const expired = req(claim({ ro: false, exp: NOW }));
    await expect(
      assertViewAsAllowed(expired, { read: true }, NOW)
    ).rejects.toThrow('ended');
    await expect(
      assertViewAsAllowed(req(claim({ sid: '' })), { read: true }, NOW)
    ).rejects.toThrow('ended');
  });

  it('reads a malformed claim as expired and read-only', async () => {
    expect(readViewAsClaim(req('junk'))).toMatchObject({ ro: true, exp: 0 });
    await expect(
      assertViewAsAllowed(req({}), { read: true }, NOW)
    ).rejects.toThrow();
  });

  it('refuses reads and writes once the session is ended', async () => {
    docs['view_as_sessions/s1'].endedAt = new FakeTimestamp(NOW - 1);
    await expect(
      assertViewAsAllowed(req(claim()), { read: true }, NOW)
    ).rejects.toThrow('ended');
    await expect(
      assertViewAsAllowed(req(claim({ ro: false })), {}, NOW)
    ).rejects.toThrow('ended');
  });

  it('refuses a missing session, or one for another admin or target', async () => {
    const read = () => assertViewAsAllowed(req(claim()), { read: true }, NOW);
    docs['view_as_sessions/s1'].targetUid = 'other';
    await expect(read()).rejects.toThrow('ended');
    docs['view_as_sessions/s1'].targetUid = 'u';
    docs['view_as_sessions/s1'].by = 'someone@x';
    await expect(read()).rejects.toThrow('ended');
    delete docs['view_as_sessions/s1'];
    await expect(read()).rejects.toThrow('ended');
  });

  it('lets a student preview token, signed in as the student, use its live session', async () => {
    const student = {
      auth: { uid: 'stu', token: { viewAs: claim({ student: true }) } },
    };
    await expect(
      assertViewAsAllowed(student, { read: true }, NOW)
    ).resolves.toMatchObject({ sid: 's1', student: true });
    docs['view_as_sessions/s1'].endedAt = new FakeTimestamp(NOW - 1);
    await expect(
      assertViewAsAllowed(student, { read: true }, NOW)
    ).rejects.toThrow('ended');
  });

  it('refuses once the session doc has expired', async () => {
    docs['view_as_sessions/s1'].expiresAt = new FakeTimestamp(NOW);
    await expect(
      assertViewAsAllowed(req(claim()), { read: true }, NOW)
    ).rejects.toThrow('ended');
  });

  it('refuses when the opener lost super admin or the switch is off', async () => {
    const read = () => assertViewAsAllowed(req(claim()), { read: true }, NOW);
    docs['organizations/orono/members/boss@x'].status = 'inactive';
    await expect(read()).rejects.toThrow('ended');
    docs['organizations/orono/members/boss@x'].status = 'active';
    docs['admin_settings/view_as'].enabled = false;
    await expect(read()).rejects.toThrow('ended');
  });
});

describe('assertPinLoginSession', () => {
  const pinReq = (data: unknown, pinSessionId?: string) => ({
    auth: {
      uid: 'u',
      token: {
        studentRole: true,
        pinLogin: true,
        ...(pinSessionId ? { pinSessionId } : {}),
      },
    },
    data,
  });

  it('lets a PIN token call for the session it was proven for', async () => {
    await expect(
      assertViewAsAllowed(pinReq({ sessionId: 's-a' }, 's-a'))
    ).resolves.toBeNull();
    await expect(assertViewAsAllowed(pinReq({}, 's-a'))).resolves.toBeNull();
  });

  it('refuses a PIN token naming another session, or a token with no session', async () => {
    await expect(
      assertViewAsAllowed(pinReq({ sessionId: 's-b' }, 's-a'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      assertViewAsAllowed(pinReq({ sessionId: 's-a' }))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('keeps a pre-scope PIN token working for 12h after sign-in only', async () => {
    const legacy = (authTime: number) => ({
      auth: {
        uid: 'u',
        token: { studentRole: true, pinLogin: true, auth_time: authTime },
      },
      data: { sessionId: 's-b' },
    });
    const now = 1_800_000_000_000;
    const hour = 3600;
    await expect(
      assertViewAsAllowed(legacy(now / 1000 - 11 * hour), {}, now)
    ).resolves.toBeNull();
    await expect(
      assertViewAsAllowed(legacy(now / 1000 - 13 * hour), {}, now)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('leaves other tokens alone', async () => {
    await expect(
      assertViewAsAllowed({
        auth: { uid: 'u', token: { studentRole: true, sso: true } },
        data: { sessionId: 's-b' },
      })
    ).resolves.toBeNull();
  });
});

describe('deactivated accounts', () => {
  const deactivated = (token: Record<string, unknown>) => ({
    auth: { uid: 'u', token: { deactivated: true, ...token } },
  });

  it('refuses a deactivated uid whatever its email claim', async () => {
    for (const token of [
      { email: 'new@elsewhere.org', email_verified: true },
      { email: 'new@elsewhere.org', email_verified: false },
      {},
    ]) {
      await expect(
        assertViewAsAllowed(deactivated(token), { read: true })
      ).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });

  it('lets sign-in resolution through and leaves live accounts alone', async () => {
    await expect(
      assertViewAsAllowed(deactivated({}), {
        read: true,
        allowDeactivated: true,
      })
    ).resolves.toBeNull();
    await expect(assertViewAsAllowed(req())).resolves.toBeNull();
    await expect(
      assertViewAsAllowed({ auth: { uid: 'u', token: { deactivated: false } } })
    ).resolves.toBeNull();
  });
});
