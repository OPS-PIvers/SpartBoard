import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserByEmailMock = vi.fn();
const createCustomTokenMock =
  vi.fn<
    (
      uid: string,
      claims: { viewAs: Record<string, unknown> & { exp: number } }
    ) => Promise<string>
  >();
let docs: Record<string, Record<string, unknown>> = {};
let writes: Array<{ op: string; path: string; data: unknown }> = [];
let nextId = 0;

const { FakeTimestamp } = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(private ms: number) {}
    static fromMillis(ms: number) {
      return new FakeTimestamp(ms);
    }
    toMillis() {
      return this.ms;
    }
  }
  return { FakeTimestamp };
});

function snap(path: string) {
  const data = docs[path];
  return {
    exists: data !== undefined,
    data: () => data,
    get: (k: string) => data?.[k],
  };
}

function ref(path: string) {
  return {
    id: path.split('/').pop(),
    path,
    get: () => Promise.resolve(snap(path)),
    update: (data: Record<string, unknown>) => {
      writes.push({ op: 'update', path, data });
      docs[path] = { ...docs[path], ...data };
      return Promise.resolve();
    },
  };
}

const db = {
  doc: (path: string) => ref(path),
  collection: (name: string) => ({
    doc: (id?: string) => ref(`${name}/${id ?? `gen${++nextId}`}`),
    add: (data: unknown) => {
      writes.push({ op: 'add', path: name, data });
      return Promise.resolve();
    },
  }),
  batch: () => {
    const ops: Array<() => void> = [];
    return {
      set: (r: { path: string }, data: Record<string, unknown>) =>
        ops.push(() => {
          writes.push({ op: 'set', path: r.path, data });
          docs[r.path] = data;
        }),
      commit: () => Promise.resolve(ops.forEach((op) => op())),
    };
  },
};

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'ts' },
    Timestamp: FakeTimestamp,
  }),
  auth: () => ({
    getUserByEmail: getUserByEmailMock,
    createCustomToken: createCustomTokenMock,
  }),
}));

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  startViewAsSessionV1,
  updateViewAsSessionV1,
  VIEW_AS_SESSION_MS,
} from './viewAs';

type Handler = (r: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
}) => Promise<Record<string, unknown>>;
const start = startViewAsSessionV1 as unknown as Handler;
const update = updateViewAsSessionV1 as unknown as Handler;

const BOSS = {
  uid: 'boss-uid',
  token: { email: 'Boss@orono.k12.mn.us', email_verified: true },
};
const boss = 'boss@orono.k12.mn.us';
const teacher = 'jane@orono.k12.mn.us';

function seed() {
  docs = {
    'admin_settings/view_as': { enabled: true, allowUnlock: true },
    [`organizations/orono/members/${boss}`]: { roleId: 'super_admin' },
  };
}

beforeEach(() => {
  seed();
  writes = [];
  nextId = 0;
  getUserByEmailMock.mockReset().mockResolvedValue({
    uid: 'jane-uid',
    disabled: false,
    customClaims: {},
  });
  createCustomTokenMock.mockReset().mockResolvedValue('tok');
});

describe('startViewAsSessionV1', () => {
  it('audits, records the session, then mints a read-only token', async () => {
    const res = await start({ auth: BOSS, data: { targetEmail: teacher } });
    expect(res).toMatchObject({
      sid: 'gen1',
      token: 'tok',
      targetUid: 'jane-uid',
      adminTarget: false,
      canUnlock: true,
    });
    const audit = writes.find((w) => w.path.startsWith('admin_audit_log'));
    expect(audit?.data).toMatchObject({
      action: 'view_as_start',
      sid: 'gen1',
      email: boss,
      targetEmail: teacher,
      targetUid: 'jane-uid',
    });
    expect(docs['view_as_sessions/gen1']).toMatchObject({
      by: boss,
      targetUid: 'jane-uid',
      unlocked: false,
      endedAt: null,
    });
    const [uid, claims] = createCustomTokenMock.mock.calls[0];
    expect(uid).toBe('jane-uid');
    expect(claims.viewAs).toMatchObject({ by: boss, sid: 'gen1', ro: true });
    expect(claims.viewAs.exp - Date.now()).toBeLessThanOrEqual(
      VIEW_AS_SESSION_MS
    );
  });

  it('refuses when the kill switch is off or missing', async () => {
    delete docs['admin_settings/view_as'];
    await expect(
      start({ auth: BOSS, data: { targetEmail: teacher } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('refuses a domain admin and an /admins-only caller (strict gate)', async () => {
    docs[`organizations/orono/members/${boss}`] = { roleId: 'domain_admin' };
    docs[`admins/${boss}`] = {};
    await expect(
      start({ auth: BOSS, data: { targetEmail: teacher } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(writes).toHaveLength(0);
  });

  it('admits a legacy super admin', async () => {
    delete docs[`organizations/orono/members/${boss}`];
    docs['admin_settings/user_roles'] = { superAdmins: [boss] };
    await expect(
      start({ auth: BOSS, data: { targetEmail: teacher } })
    ).resolves.toMatchObject({ token: 'tok' });
  });

  it('refuses an unverified email', async () => {
    await expect(
      start({
        auth: { uid: 'x', token: { email: boss, email_verified: false } },
        data: { targetEmail: teacher },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses viewing as yourself, by email or uid', async () => {
    await expect(
      start({ auth: BOSS, data: { targetEmail: 'BOSS@orono.k12.mn.us' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    getUserByEmailMock.mockResolvedValue({ uid: 'boss-uid', customClaims: {} });
    await expect(
      start({ auth: BOSS, data: { targetEmail: teacher } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses from inside a view-as tab', async () => {
    await expect(
      start({
        auth: { ...BOSS, token: { ...BOSS.token, viewAs: { sid: 's' } } },
        data: { targetEmail: teacher },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses student accounts and unknown emails', async () => {
    getUserByEmailMock.mockResolvedValueOnce({
      uid: 'kid',
      customClaims: { studentRole: true },
    });
    await expect(
      start({ auth: BOSS, data: { targetEmail: 'kid@x' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    getUserByEmailMock.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    await expect(
      start({ auth: BOSS, data: { targetEmail: 'nobody@x' } })
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('marks an org admin with no /admins doc as an admin target', async () => {
    docs[`organizations/orono/members/${teacher}`] = {
      roleId: 'building_admin',
    };
    const res = await start({ auth: BOSS, data: { targetEmail: teacher } });
    expect(res.adminTarget).toBe(true);
  });

  it('logs an end entry when the token cannot be minted', async () => {
    createCustomTokenMock.mockRejectedValueOnce(new Error('iam'));
    await expect(
      start({ auth: BOSS, data: { targetEmail: teacher } })
    ).rejects.toMatchObject({ code: 'internal' });
    expect(
      writes.filter((w) => w.path === 'admin_audit_log').map((w) => w.data)
    ).toEqual([expect.objectContaining({ action: 'view_as_end' })]);
  });

  it('marks an admin target', async () => {
    docs[`admins/${teacher}`] = {};
    const res = await start({ auth: BOSS, data: { targetEmail: teacher } });
    expect(res.adminTarget).toBe(true);
    expect(res.canUnlock).toBe(false);
    expect(createCustomTokenMock.mock.calls[0][1].viewAs.adminTarget).toBe(
      true
    );
  });
});

describe('updateViewAsSessionV1', () => {
  const live = (over: Record<string, unknown> = {}) => {
    docs['view_as_sessions/s1'] = {
      by: boss,
      targetEmail: teacher,
      targetUid: 'jane-uid',
      adminTarget: false,
      unlocked: false,
      reason: null,
      expiresAt: FakeTimestamp.fromMillis(Date.now() + 60_000),
      endedAt: null,
      ...over,
    };
  };
  const asTab = (claimOver: Record<string, unknown> = {}) => ({
    uid: 'jane-uid',
    token: {
      email: teacher,
      email_verified: true,
      viewAs: {
        by: boss,
        sid: 's1',
        ro: true,
        adminTarget: false,
        exp: Date.now() + 60_000,
        ...claimOver,
      },
    },
  });

  it('unlocks with a reason, audits it, and re-mints without ro', async () => {
    live();
    const res = await update({
      auth: asTab(),
      data: { action: 'unlock', reason: 'fix her quiz settings' },
    });
    expect(res.unlocked).toBe(true);
    expect(docs['view_as_sessions/s1']).toMatchObject({
      unlocked: true,
      reason: 'fix her quiz settings',
    });
    expect(createCustomTokenMock.mock.calls[0][1].viewAs.ro).toBe(false);
    expect(
      writes.find((w) => w.path === 'admin_audit_log')?.data
    ).toMatchObject({
      action: 'view_as_unlock',
      reason: 'fix her quiz settings',
    });
  });

  it('refuses unlock and renews read-only while allowUnlock is off', async () => {
    live({ unlocked: true });
    docs['admin_settings/view_as'] = { enabled: true };
    await expect(
      update({ auth: asTab(), data: { action: 'unlock', reason: 'fix it' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const res = await update({ auth: asTab(), data: { action: 'renew' } });
    expect(res.unlocked).toBe(false);
    expect(createCustomTokenMock.mock.calls[0][1].viewAs.ro).toBe(true);
  });

  it('refuses unlock without a reason', async () => {
    live();
    await expect(
      update({ auth: asTab(), data: { action: 'unlock' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('never unlocks an admin target, even if the role was added mid-session', async () => {
    live({ adminTarget: true });
    await expect(
      update({ auth: asTab(), data: { action: 'unlock', reason: 'look' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    live();
    docs[`organizations/orono/members/${teacher}`] = { roleId: 'domain_admin' };
    await expect(
      update({ auth: asTab(), data: { action: 'unlock', reason: 'look' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    delete docs[`organizations/orono/members/${teacher}`];
    docs[`admins/${teacher}`] = {};
    await expect(
      update({ auth: asTab(), data: { action: 'unlock', reason: 'look' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('renews an hour out and keeps the lock state', async () => {
    live();
    const res = await update({ auth: asTab(), data: { action: 'renew' } });
    expect(Number(res.expiresAt) - Date.now()).toBeGreaterThan(
      VIEW_AS_SESSION_MS - 5000
    );
    expect(createCustomTokenMock.mock.calls[0][1].viewAs.ro).toBe(true);
  });

  it('refuses renew when the admin lost super admin or the switch is off', async () => {
    live();
    docs[`organizations/orono/members/${boss}`] = { roleId: 'teacher' };
    await expect(
      update({ auth: asTab(), data: { action: 'renew' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    seed();
    live();
    docs['admin_settings/view_as'] = { enabled: false };
    await expect(
      update({ auth: asTab(), data: { action: 'renew' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses renew on an ended or expired session', async () => {
    live({ endedAt: 'ts' });
    await expect(
      update({ auth: asTab(), data: { action: 'renew' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    live();
    await expect(
      update({
        auth: asTab({ exp: Date.now() - 1 }),
        data: { action: 'renew' },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses a claim whose session belongs to someone else', async () => {
    live({ targetUid: 'other' });
    await expect(
      update({ auth: asTab(), data: { action: 'renew' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('ends from the tab, even when the switch is off, and audits once', async () => {
    live();
    docs['admin_settings/view_as'] = { enabled: false };
    await expect(
      update({ auth: asTab(), data: { action: 'end' } })
    ).resolves.toEqual({ ended: true });
    await update({ auth: asTab(), data: { action: 'end' } });
    expect(writes.filter((w) => w.path === 'admin_audit_log')).toHaveLength(1);
  });

  it('lets the opener end its own session by id, and nobody else', async () => {
    live();
    await expect(
      update({ auth: BOSS, data: { action: 'end', sid: 's1' } })
    ).resolves.toEqual({ ended: true });
    live();
    await expect(
      update({
        auth: { uid: 'o', token: { email: 'other@x', email_verified: true } },
        data: { action: 'end', sid: 's1' },
      })
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      update({
        auth: BOSS,
        data: { action: 'unlock', sid: 's1', reason: 'xyz' },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
