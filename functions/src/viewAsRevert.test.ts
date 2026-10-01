import { describe, it, expect, vi, beforeEach } from 'vitest';

let docs: Record<string, Record<string, unknown>> = {};
let writes: Array<{ op: string; path: string; data: Record<string, unknown> }> =
  [];
let nextId = 0;

const { FakeTimestamp, DELETE } = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(private ms: number) {}
    toMillis() {
      return this.ms;
    }
  }
  return { FakeTimestamp, DELETE: { __delete: true } };
});

function getPath(data: Record<string, unknown> | undefined, key: string) {
  let v: unknown = data;
  for (const part of key.split('.')) {
    v =
      v && typeof v === 'object'
        ? (v as Record<string, unknown>)[part]
        : undefined;
  }
  return v;
}

function snap(path: string) {
  const data = docs[path];
  return {
    exists: data !== undefined,
    data: () => data,
    get: (k: string) => getPath(data, k),
  };
}

function ref(path: string) {
  return {
    id: path.split('/').pop(),
    path,
    get: () => Promise.resolve(snap(path)),
  };
}

const db = {
  doc: (path: string) => ref(path),
  collection: (name: string) => ({
    doc: (id?: string) => ref(`${name}/${id ?? `gen${++nextId}`}`),
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        get: () =>
          Promise.resolve({
            empty: !Object.entries(docs).some(
              ([p, d]) => p.startsWith(`${name}/`) && d[field] === value
            ),
          }),
      }),
    }),
  }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const ops: Array<() => void> = [];
    const tx = {
      get: (r: { path: string }) => Promise.resolve(snap(r.path)),
      update: (r: { path: string }, data: Record<string, unknown>) =>
        ops.push(() => {
          writes.push({ op: 'update', path: r.path, data });
          const next = { ...docs[r.path] };
          for (const [k, v] of Object.entries(data)) {
            if (v === DELETE) delete next[k];
            else next[k] = v;
          }
          docs[r.path] = next;
        }),
      set: (r: { path: string }, data: Record<string, unknown>) =>
        ops.push(() => {
          writes.push({ op: 'set', path: r.path, data });
          docs[r.path] = data;
        }),
    };
    const result = await fn(tx);
    ops.forEach((op) => op());
    return result;
  },
};

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => 'ts', delete: () => DELETE },
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
  revertViewAsChangeV1,
  parseRevertPath,
  normalizeValue,
  stripPii,
} from './viewAsRevert';

type Handler = (r: {
  auth?: { uid: string; token: Record<string, unknown> };
  data: unknown;
}) => Promise<Record<string, unknown>>;
const revert = revertViewAsChangeV1 as unknown as Handler;

const boss = 'boss@orono.k12.mn.us';
const BOSS = {
  uid: 'boss-uid',
  token: { email: 'Boss@orono.k12.mn.us', email_verified: true },
};
const BOARD = 'users/jane-uid/dashboards/b1';

function seed() {
  docs = {
    [`organizations/orono/members/${boss}`]: { roleId: 'super_admin' },
    'view_as_sessions/s1': { by: boss, targetUid: 'jane-uid' },
    [BOARD]: {
      name: 'Board',
      widgets: [
        { id: 'w1', type: 'clock', x: 50, y: 60, config: { format24: true } },
        { id: 'w2', type: 'text', x: 0, y: 0, config: {} },
      ],
    },
    'users/jane-uid/userProfile/profile': { prefs: { theme: 'dark' } },
    'admin_audit_log/approve1': {
      action: 'view_as_approve',
      sid: 's1',
      email: boss,
      targetEmail: 'jane@orono.k12.mn.us',
      targetUid: 'jane-uid',
      path: `${BOARD}#widgets/w1`,
      before: { x: 10, y: 20, config: { format24: false } },
      after: { x: 50, y: 60, config: { format24: true } },
    },
    'admin_audit_log/save1': {
      action: 'view_as_save',
      sid: 's1',
      email: boss,
      targetEmail: 'jane@orono.k12.mn.us',
      targetUid: 'jane-uid',
      path: 'users/jane-uid/userProfile/profile',
      before: {},
      after: { 'prefs.theme': 'dark' },
    },
  };
}

beforeEach(() => {
  seed();
  writes = [];
  nextId = 0;
});

describe('parseRevertPath', () => {
  it('accepts doc and widget paths inside the target account', () => {
    expect(parseRevertPath('users/u/quizzes/q', 'u')).toEqual({
      docPath: 'users/u/quizzes/q',
      widgetId: null,
    });
    expect(parseRevertPath('users/u/dashboards/b#widgets/w', 'u')).toEqual({
      docPath: 'users/u/dashboards/b',
      widgetId: 'w',
    });
  });

  it.each([
    'users/other/quizzes/q',
    'admin_settings/view_as',
    'users/u/private/google',
    'users/u/quizzes',
    'users/u/quizzes/q#widgets/w',
    'users/u/dashboards/b#widgets/w#x',
    'users/u/../x/y',
  ])('refuses %s', (path) => {
    expect(() => parseRevertPath(path, 'u')).toThrow();
  });
});

describe('normalizeValue and stripPii', () => {
  it('sorts keys and flattens timestamps', () => {
    expect(
      JSON.stringify(normalizeValue({ b: 1, a: new FakeTimestamp(5) }))
    ).toBe('{"a":{"__timestamp":5},"b":1}');
  });

  it('drops roster names and custom-mode assignments from config', () => {
    expect(
      stripPii('config', {
        firstNames: 'Ann',
        rosterMode: 'custom',
        assignments: { Ann: 1 },
        title: 'x',
      })
    ).toEqual({ rosterMode: 'custom', title: 'x' });
    expect(stripPii('x', { firstNames: 'Ann' })).toEqual({ firstNames: 'Ann' });
  });
});

describe('revertViewAsChangeV1', () => {
  it('restores a widget when it still holds the logged after', async () => {
    const res = await revert({ auth: BOSS, data: { logId: 'approve1' } });
    expect(res).toEqual({ status: 'reverted' });
    const widgets = docs[BOARD].widgets as Array<Record<string, unknown>>;
    expect(widgets[0]).toEqual({
      id: 'w1',
      type: 'clock',
      x: 10,
      y: 20,
      config: { format24: false },
    });
    expect(widgets[1].id).toBe('w2');
    const audit = writes.find((w) => w.path.startsWith('admin_audit_log/'));
    expect(audit?.data).toMatchObject({
      action: 'view_as_revert',
      sid: 's1',
      email: boss,
      targetUid: 'jane-uid',
      revertOf: 'approve1',
      forced: false,
      before: { x: 50, y: 60, config: { format24: true } },
      after: { x: 10, y: 20, config: { format24: false } },
    });
  });

  it('deletes a field the save created', async () => {
    const res = await revert({ auth: BOSS, data: { logId: 'save1' } });
    expect(res).toEqual({ status: 'reverted' });
    const update = writes.find((w) => w.op === 'update');
    expect(update?.data).toEqual({ 'prefs.theme': DELETE });
  });

  it('returns the current values on conflict and writes nothing', async () => {
    (docs[BOARD].widgets as Array<Record<string, unknown>>)[0].x = 99;
    const res = await revert({ auth: BOSS, data: { logId: 'approve1' } });
    expect(res).toEqual({
      status: 'conflict',
      current: { x: 99, y: 60, config: { format24: true } },
    });
    expect(writes).toHaveLength(0);
  });

  it('forces only when the current values still match what the admin saw', async () => {
    (docs[BOARD].widgets as Array<Record<string, unknown>>)[0].x = 99;
    const stale = await revert({
      auth: BOSS,
      data: { logId: 'approve1', force: true, seen: { x: 98, y: 60 } },
    });
    expect(stale.status).toBe('conflict');
    const res = await revert({
      auth: BOSS,
      data: {
        logId: 'approve1',
        force: true,
        seen: { x: 99, y: 60, config: { format24: true } },
      },
    });
    expect(res).toEqual({ status: 'reverted' });
    const audit = writes.find((w) => w.path.startsWith('admin_audit_log/'));
    expect(audit?.data.forced).toBe(true);
  });

  it('reports a widget that no longer exists', async () => {
    docs[BOARD].widgets = [];
    expect(await revert({ auth: BOSS, data: { logId: 'approve1' } })).toEqual({
      status: 'missing',
    });
  });

  it('reports a change that was already reverted', async () => {
    docs['admin_audit_log/r0'] = {
      action: 'view_as_revert',
      revertOf: 'approve1',
    };
    expect(await revert({ auth: BOSS, data: { logId: 'approve1' } })).toEqual({
      status: 'already',
    });
  });

  it('ignores PII in the logged config and never writes it back', async () => {
    const entry = docs['admin_audit_log/approve1'];
    entry.before = { config: { format24: false, names: ['Ann'] } };
    entry.after = { config: { format24: true, names: ['Ann'] } };
    expect(await revert({ auth: BOSS, data: { logId: 'approve1' } })).toEqual({
      status: 'reverted',
    });
    const widgets = docs[BOARD].widgets as Array<Record<string, unknown>>;
    expect(widgets[0].config).toEqual({ format24: false });
  });

  it('refuses non super admins', async () => {
    docs[`organizations/orono/members/${boss}`] = { roleId: 'domain_admin' };
    await expect(
      revert({ auth: BOSS, data: { logId: 'approve1' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses any View as token, even an unlocked one', async () => {
    await expect(
      revert({
        auth: {
          uid: 'jane-uid',
          token: {
            email: 'jane@orono.k12.mn.us',
            email_verified: true,
            viewAs: {
              by: boss,
              sid: 's1',
              ro: false,
              adminTarget: false,
              exp: Date.now() + 60_000,
            },
          },
        },
        data: { logId: 'approve1' },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses entries with no matching session or a non-revertable action', async () => {
    docs['admin_audit_log/approve1'].sid = 'forged';
    await expect(
      revert({ auth: BOSS, data: { logId: 'approve1' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    docs['admin_audit_log/approve1'].sid = 's1';
    docs['admin_audit_log/approve1'].email = 'other@orono.k12.mn.us';
    await expect(
      revert({ auth: BOSS, data: { logId: 'approve1' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    docs['admin_audit_log/start'] = { action: 'view_as_start', sid: 's1' };
    await expect(
      revert({ auth: BOSS, data: { logId: 'start' } })
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses to touch a widget id or type', async () => {
    const entry = docs['admin_audit_log/approve1'];
    entry.before = { type: 'text' };
    entry.after = { type: 'clock' };
    await expect(
      revert({ auth: BOSS, data: { logId: 'approve1' } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
