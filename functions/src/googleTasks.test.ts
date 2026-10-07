/* eslint-disable @typescript-eslint/require-await -- fakes mirror Promise-returning APIs */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  syncParentWrite,
  setGoogleTasksSyncV1,
  pullGoogleTasksStatusV1,
} from './googleTasks';

const store = new Map<string, Record<string, unknown>>();

function snap(path: string) {
  const data = store.get(path);
  return {
    id: path.split('/').pop() ?? '',
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
    get: (field: string) => data?.[field],
  };
}

function docRef(path: string): Record<string, unknown> {
  return {
    id: path.split('/').pop(),
    path,
    get: async () => snap(path),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const next = opts?.merge ? { ...(store.get(path) ?? {}) } : {};
      for (const [k, v] of Object.entries(data)) {
        if (v === DELETE) delete next[k];
        else next[k] = v;
      }
      store.set(path, next);
    },
    create: async (data: Record<string, unknown>) => {
      if (store.has(path))
        throw Object.assign(new Error('exists'), { code: 6 });
      store.set(path, { ...data });
    },
    update: async (data: Record<string, unknown>) => {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
    },
    delete: async () => {
      store.delete(path);
    },
    collection: (name: string) => colRef(`${path}/${name}`),
  };
}

function children(path: string) {
  return [...store.keys()].filter(
    (k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/')
  );
}

function colRef(path: string): Record<string, unknown> {
  const query = (filter: (d: Record<string, unknown>) => boolean) => ({
    get: async () => ({
      docs: children(path)
        .filter((k) => filter(store.get(k) ?? {}))
        .map((k) => ({ ...snap(k), ref: docRef(k) })),
    }),
  });
  return {
    path,
    doc: (id: string) => docRef(`${path}/${id}`),
    ...query(() => true),
    where: (field: string, op: string, value: unknown) =>
      query((d) =>
        op === 'array-contains'
          ? Array.isArray(d[field]) && (d[field] as unknown[]).includes(value)
          : (value as unknown[]).includes(d[field])
      ),
    count: () => ({
      get: async () => ({ data: () => ({ count: children(path).length }) }),
    }),
  };
}

const DELETE = Symbol('delete');

vi.mock('firebase-admin', () => {
  const firestore = Object.assign(
    () => ({
      doc: (p: string) => docRef(p),
      collection: (p: string) => colRef(p),
      recursiveDelete: async (ref: { path: string }) => {
        for (const k of [...store.keys()]) {
          if (k.startsWith(`${ref.path}/`)) store.delete(k);
        }
      },
    }),
    { FieldValue: { delete: () => DELETE } }
  );
  return { apps: [{}], initializeApp: vi.fn(), firestore };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
      public details?: unknown
    ) {
      super(message);
    }
  }
  return { onCall: (a: unknown, b?: unknown) => b ?? a, HttpsError };
});
vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: vi.fn() }));
const granted = vi.fn(async () => true);
vi.mock('./quizMediaArchive', () => ({
  isGlobalFeatureGranted: (...args: unknown[]) => granted(...(args as [])),
}));
vi.mock('./googleOAuth', () => ({
  GOOGLE_OAUTH_CLIENT_ID: {},
  GOOGLE_OAUTH_CLIENT_SECRET: {},
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY: {},
  refreshGoogleAccessTokenForUid: async () => ({
    accessToken: 'tok',
    expiresIn: 3600,
  }),
}));

interface Call {
  method: string;
  url: string;
  data?: Record<string, unknown>;
}
const calls: Call[] = [];
let nextId = 0;
let respond: (c: Call) => unknown = (c) => {
  if (c.method === 'POST') return { id: `id${++nextId}` };
  return {};
};
vi.mock('axios', () => {
  const request = async (c: Call) => {
    calls.push(c);
    return { data: respond(c) };
  };
  return {
    default: {
      request,
      isAxiosError: (e: unknown) => !!(e as { isAxios?: boolean })?.isAxios,
    },
  };
});

const notFound = () =>
  Object.assign(new Error('404'), { isAxios: true, response: { status: 404 } });

const TASKS = 'https://www.googleapis.com/auth/tasks';
const item = (over: Record<string, unknown> = {}) => ({
  id: 'a',
  text: 'Email parents',
  done: false,
  assigneeUid: 'u1',
  createdBy: 'u2',
  createdAt: 1,
  ...over,
});
const note = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  title: 'Oct 6 meeting',
  actionItems: items,
  ...extra,
});
const write = (before: unknown, after: unknown) =>
  syncParentWrite({
    plcId: 'p1',
    source: 'note',
    parentId: 'n1',
    before: before as Record<string, unknown> | undefined,
    after: after as Record<string, unknown> | undefined,
  });

beforeEach(() => {
  store.clear();
  calls.length = 0;
  nextId = 0;
  respond = (c) => (c.method === 'POST' ? { id: `id${++nextId}` } : {});
  granted.mockResolvedValue(true);
  store.set('plcs/p1', {
    name: 'Grade 6 Math',
    members: { u1: { status: 'active' }, u2: { status: 'active' } },
    memberUids: ['u1', 'u2'],
  });
  store.set('users/u1/private/googleAuth', { scope: `drive.file ${TASKS}` });
  store.set('users/u1/private/googleTasks', {
    enabled: true,
    listId: 'L1',
    email: 'u1@x.org',
  });
});

describe('push trigger', () => {
  it('creates a task with the team and note heading', async () => {
    await write(undefined, note([item()]));
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/lists/L1/tasks');
    expect(calls[0].data).toMatchObject({
      title: 'Email parents',
      status: 'needsAction',
    });
    expect(String(calls[0].data?.notes)).toMatch(
      /^Grade 6 Math · Oct 6 meeting\n.*\/plc\/p1\/docs$/
    );
    const map = store.get('users/u1/private/googleTasks/map/p1_note_n1_a');
    expect(map).toMatchObject({ taskId: 'id1', listId: 'L1', pending: false });
  });

  it('does nothing when the mirror rewrites identical items', async () => {
    await write(note([item()]), note([item()]));
    expect(calls).toHaveLength(0);
  });

  it('patches on check-off, then skips a repeat with the same content', async () => {
    await write(undefined, note([item()]));
    await write(note([item()]), note([item({ done: true })]));
    expect(calls[1]).toMatchObject({ method: 'PATCH' });
    expect(calls[1].url).toContain('/tasks/id1');
    expect(calls[1].data?.status).toBe('completed');
    await write(note([item()]), note([item({ done: true })]));
    expect(calls).toHaveLength(2);
  });

  it('reopening clears completed in Google', async () => {
    await write(undefined, note([item({ done: true })]));
    await write(note([item({ done: true })]), note([item()]));
    expect(calls[1].data).toMatchObject({
      status: 'needsAction',
      completed: null,
    });
  });

  it('reassignment deletes from the old list only for connected users', async () => {
    await write(undefined, note([item()]));
    await write(note([item()]), note([item({ assigneeUid: 'u2' })]));
    expect(calls[1].method).toBe('DELETE');
    expect(calls).toHaveLength(2);
    expect(store.has('users/u1/private/googleTasks/map/p1_note_n1_a')).toBe(
      false
    );
  });

  it('soft-deleting the note deletes its tasks', async () => {
    await write(undefined, note([item()]));
    await write(note([item()]), note([item()], { deletedAt: 5 }));
    expect(calls[1].method).toBe('DELETE');
  });

  it('skips users who are not connected, flag-off, or no longer members', async () => {
    store.set('users/u1/private/googleTasks', { enabled: false });
    await write(undefined, note([item()]));
    store.set('users/u1/private/googleTasks', { enabled: true, listId: 'L1' });
    granted.mockResolvedValue(false);
    await write(undefined, note([item()]));
    granted.mockResolvedValue(true);
    store.set('plcs/p1', {
      name: 'x',
      members: { u1: { status: 'removed' } },
      memberUids: [],
    });
    await write(undefined, note([item()]));
    expect(calls).toHaveLength(0);
  });

  it('disconnects when the grant lacks the Tasks scope', async () => {
    store.set('users/u1/private/googleAuth', { scope: 'drive.file' });
    await write(undefined, note([item()]));
    expect(calls).toHaveLength(0);
    expect(store.get('users/u1/private/googleTasks')).toMatchObject({
      enabled: false,
      disconnectReason: 'missing-scope',
    });
  });

  it('replaces a claim abandoned by a dead instance', async () => {
    store.set('users/u1/private/googleTasks/map/p1_note_n1_a', {
      pending: true,
      claimedAt: Date.now() - 120_000,
    });
    await write(undefined, note([item()]));
    expect(calls.map((c) => c.method)).toEqual(['POST']);
    expect(
      store.get('users/u1/private/googleTasks/map/p1_note_n1_a')
    ).toMatchObject({ taskId: 'id1', pending: false });
  });

  it('recreates the SpartBoard list when the user deleted it', async () => {
    respond = (c) => {
      if (c.url.includes('/lists/L1/tasks')) throw notFound();
      return c.method === 'POST' ? { id: `id${++nextId}` } : {};
    };
    await write(undefined, note([item()]));
    expect(calls.map((c) => c.method)).toEqual(['POST', 'POST', 'POST']);
    expect(calls[1].url).toContain('/users/@me/lists');
    expect(store.get('users/u1/private/googleTasks')?.listId).toBe('id1');
    expect(
      store.get('users/u1/private/googleTasks/map/p1_note_n1_a')
    ).toMatchObject({ taskId: 'id2', listId: 'id1' });
  });
});

describe('setGoogleTasksSyncV1', () => {
  const call = (enabled: boolean) =>
    (setGoogleTasksSyncV1 as unknown as (r: unknown) => Promise<unknown>)({
      auth: { uid: 'u1', token: { email: 'U1@x.org' } },
      data: { enabled },
    });

  it('backfills open items assigned to the user across their teams', async () => {
    store.set('users/u1/private/googleTasks', {});
    store.set(
      'plcs/p1/notes/n1',
      note([
        item(),
        item({ id: 'b', done: true }),
        item({ id: 'c', assigneeUid: 'u2' }),
      ])
    );
    store.set('plcs/p1/notes/n2', note([item({ id: 'd' })], { deletedAt: 1 }));
    store.set('plcs/p1/docs/d1', {
      title: 'Doc',
      actionItems: [item({ id: 'e' })],
    });
    const res = await call(true);
    expect(res).toEqual({ enabled: true, syncedCount: 2 });
    const titles = calls.filter((c) => c.url.endsWith('/tasks'));
    expect(titles).toHaveLength(2);
    expect(store.get('users/u1/private/googleTasks')).toMatchObject({
      enabled: true,
      email: 'u1@x.org',
    });
  });

  it('refuses to connect without the Tasks scope', async () => {
    store.set('users/u1/private/googleAuth', { scope: 'drive.file' });
    await expect(call(true)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('turning off clears the map but leaves Google untouched', async () => {
    await write(undefined, note([item()]));
    calls.length = 0;
    await call(false);
    expect(calls).toHaveLength(0);
    expect([...store.keys()].some((k) => k.includes('/googleTasks/map/'))).toBe(
      false
    );
    expect(store.get('users/u1/private/googleTasks')?.enabled).toBe(false);
  });
});

describe('pullGoogleTasksStatusV1', () => {
  it('returns only items whose Google state differs from the last push', async () => {
    await write(undefined, note([item(), item({ id: 'b' })]));
    respond = (c) =>
      c.method === 'GET'
        ? {
            items: [
              { id: 'id1', status: 'completed' },
              { id: 'id2', status: 'needsAction' },
            ],
          }
        : {};
    const res = await (
      pullGoogleTasksStatusV1 as unknown as (r: unknown) => Promise<unknown>
    )({ auth: { uid: 'u1', token: {} }, data: {} });
    expect(res).toEqual({
      changes: [
        {
          plcId: 'p1',
          source: 'note',
          parentId: 'n1',
          itemId: 'a',
          done: true,
        },
      ],
    });
    const get = calls.find((c) => c.method === 'GET');
    expect(get?.url).toContain('/lists/L1/tasks');
  });
});
