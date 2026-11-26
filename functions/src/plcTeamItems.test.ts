// plcTeamItemsV1 mirrors the firestore.rules checks for PLC updates, goals, links, tasks, to-dos and activity.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const deactivated = vi.hoisted(() => ({ value: false }));

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'TS' },
  }),
}));
vi.mock('./authz', () => ({
  hasDeactivatedClaim: () => false,
  isDeactivatedOperatorMember: () => Promise.resolve(deactivated.value),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});

import type * as admin from './firebaseAdmin';
import {
  parseTeamItemAction,
  runTeamItemAction,
  passesGate,
  type TeamItemAction,
  type TeamItemCaller,
} from './plcTeamItems';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const TS = 'TS';
const plc = (): StubData => ({
  leadUid: 'lead',
  memberUids: ['lead', 'co', 'mem', 'view', 'gone'],
  members: {
    lead: { role: 'lead', status: 'active' },
    co: { role: 'coLead', status: 'active' },
    mem: { role: 'member', status: 'active' },
    view: { role: 'viewer', status: 'active' },
    gone: { role: 'coLead', status: 'removed' },
    out: { role: 'coLead', status: 'active' },
  },
});

const caller = (uid: string, extra: Partial<TeamItemCaller> = {}) => ({
  uid,
  emailLower: `${uid}@x.edu`,
  displayName: uid.toUpperCase(),
  ...extra,
});

const draft = {
  title: 'Hello',
  body: 'Body',
  requiresAck: false,
  inDigest: true,
};

function setup(seed: Record<string, StubData> = {}) {
  const stub = makeStubFirestore({ 'plcs/p': plc(), ...seed });
  const db = stub.db as unknown as admin.firestore.Firestore;
  const run = (uid: string, action: TeamItemAction, extra = {}) =>
    runTeamItemAction(db, caller(uid, extra), action, TS);
  const reason = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'ok';
    } catch (e) {
      return (
        (e as { details?: { reason?: string } }).details?.reason ?? String(e)
      );
    }
  };
  return { stub, run, reason };
}

const docsIn = (stub: ReturnType<typeof makeStubFirestore>, coll: string) =>
  [...stub.store.keys()].filter((k) => k.startsWith(`plcs/p/${coll}/`));

beforeEach(() => {
  deactivated.value = false;
});

describe('passesGate', () => {
  it('matches plcReader, plcEditor and isPlcMembershipManager', () => {
    const p = plc();
    expect(passesGate(p, 'view', 'reader')).toBe(true);
    expect(passesGate(p, 'view', 'editor')).toBe(false);
    expect(passesGate(p, 'mem', 'editor')).toBe(true);
    expect(passesGate(p, 'mem', 'manager')).toBe(false);
    expect(passesGate(p, 'co', 'manager')).toBe(true);
    expect(passesGate(p, 'gone', 'manager')).toBe(false);
    // A members entry without memberUids grants nothing.
    expect(passesGate(p, 'out', 'reader')).toBe(false);
    // Legacy map-less PLC: the lead still manages; others edit.
    const legacy = { leadUid: 'lead', memberUids: ['lead', 'x'] };
    expect(passesGate(legacy, 'lead', 'manager')).toBe(true);
    expect(passesGate(legacy, 'x', 'editor')).toBe(true);
    expect(passesGate(legacy, 'x', 'manager')).toBe(false);
  });
});

describe('parseTeamItemAction', () => {
  it('rejects unknown actions, bad ids and oversized to-do lists', () => {
    expect(() => parseTeamItemAction({ action: 'nope', plcId: 'p' })).toThrow();
    expect(() =>
      parseTeamItemAction({ action: 'deleteGoal', plcId: 'p', goalId: 'a/b' })
    ).toThrow();
    expect(() =>
      parseTeamItemAction({
        action: 'archiveTodos',
        plcId: 'p',
        ids: Array.from({ length: 101 }, (_, i) => `t${i}`),
      })
    ).toThrow();
    expect(
      parseTeamItemAction({ action: 'deleteLink', plcId: 'p', linkId: 'l1' })
    ).toEqual({ action: 'deleteLink', plcId: 'p', linkId: 'l1' });
  });
});

describe('updates', () => {
  it('lead and co-lead post; member, viewer and removed co-lead cannot', async () => {
    const { stub, run, reason } = setup();
    const post = { action: 'postUpdate', plcId: 'p', draft } as const;
    expect(await reason(run('lead', post))).toBe('ok');
    expect(await reason(run('co', post))).toBe('ok');
    expect(await reason(run('mem', post))).toBe('notAllowed');
    expect(await reason(run('view', post))).toBe('notAllowed');
    expect(await reason(run('gone', post))).toBe('notAllowed');
    expect(await reason(run('stranger', post))).toBe('notAllowed');
    const [first] = docsIn(stub, 'updates');
    expect(stub.get(first)).toEqual({
      ...draft,
      pinned: false,
      reactions: {},
      authorUid: 'lead',
      authorName: 'LEAD',
      createdAt: TS,
      updatedAt: TS,
    });
  });

  it('checks the update shape', async () => {
    const { run, reason } = setup();
    const post = (d: StubData) =>
      run('lead', { action: 'postUpdate', plcId: 'p', draft: d as never });
    expect(await reason(post({ ...draft, title: '' }))).toBe('invalid');
    expect(await reason(post({ ...draft, title: 'x'.repeat(201) }))).toBe(
      'invalid'
    );
    expect(await reason(post({ ...draft, body: 'x'.repeat(5001) }))).toBe(
      'invalid'
    );
    expect(await reason(post({ ...draft, linkUrl: 'http://a.b' }))).toBe(
      'invalid'
    );
    expect(await reason(post({ ...draft, linkUrl: 'https://a.b' }))).toBe('ok');
    expect(
      await reason(
        post({
          ...draft,
          attachment: { name: 'f', url: 'https://evil.com/x' },
        })
      )
    ).toBe('invalid');
    expect(
      await reason(
        post({
          ...draft,
          attachment: { name: 'f', url: 'https://drive.google.com/x' },
        })
      )
    ).toBe('ok');
    expect(
      await reason(
        post({
          ...draft,
          attachment: { name: 'f', url: 'https://docs.google.com/x', x: 1 },
        })
      )
    ).toBe('invalid');
    expect(await reason(post({ ...draft, requiresAck: 'yes' }))).toBe(
      'invalid'
    );
    // Extra draft fields never reach the stored doc.
    expect(await reason(post({ ...draft, authorUid: 'mem' }))).toBe('ok');
  });

  it('edit and pin keep author, createdAt and reactions; members cannot', async () => {
    const stored = {
      ...draft,
      linkUrl: 'https://a.b',
      pinned: false,
      reactions: { mem: true },
      authorUid: 'lead',
      authorName: 'LEAD',
      createdAt: 1,
      updatedAt: 1,
    };
    const { stub, run, reason } = setup({ 'plcs/p/updates/u1': stored });
    const edit = {
      action: 'editUpdate',
      plcId: 'p',
      updateId: 'u1',
      draft: { ...draft, title: 'New' },
    } as const;
    expect(await reason(run('mem', edit))).toBe('notAllowed');
    expect(await reason(run('co', edit))).toBe('ok');
    expect(stub.get('plcs/p/updates/u1')).toEqual({
      ...draft,
      title: 'New',
      pinned: false,
      reactions: { mem: true },
      authorUid: 'lead',
      authorName: 'LEAD',
      createdAt: 1,
      updatedAt: TS,
    });
    expect(
      await reason(
        run('lead', {
          action: 'pinUpdate',
          plcId: 'p',
          updateId: 'u1',
          pinned: true,
        })
      )
    ).toBe('ok');
    expect(stub.get('plcs/p/updates/u1')?.pinned).toBe(true);
    expect(
      await reason(
        run('lead', {
          action: 'pinUpdate',
          plcId: 'p',
          updateId: 'missing',
          pinned: true,
        })
      )
    ).toBe('notFound');
  });

  it('refuses an edit when the stored doc has a field outside the allowlist', async () => {
    const { run, reason } = setup({
      'plcs/p/updates/u1': {
        ...draft,
        pinned: false,
        reactions: {},
        authorUid: 'lead',
        authorName: 'L',
        createdAt: 1,
        updatedAt: 1,
        extra: true,
      },
    });
    expect(
      await reason(
        run('lead', {
          action: 'pinUpdate',
          plcId: 'p',
          updateId: 'u1',
          pinned: true,
        })
      )
    ).toBe('invalid');
  });

  it('only managers delete', async () => {
    const { stub, run, reason } = setup({
      'plcs/p/updates/u1': { title: 'x' },
    });
    const del = { action: 'deleteUpdate', plcId: 'p', updateId: 'u1' } as const;
    expect(await reason(run('mem', del))).toBe('notAllowed');
    expect(stub.has('plcs/p/updates/u1')).toBe(true);
    expect(await reason(run('lead', del))).toBe('ok');
    expect(stub.has('plcs/p/updates/u1')).toBe(false);
  });
});

describe('goals', () => {
  const goal = { title: 'Read more', practices: [], order: 0 };

  it('any non-viewer member creates; createdBy is the caller', async () => {
    const { stub, run, reason } = setup();
    const save = { action: 'saveGoal', plcId: 'p', goal } as const;
    expect(await reason(run('view', save))).toBe('notAllowed');
    expect(await reason(run('mem', save))).toBe('ok');
    const [path] = docsIn(stub, 'goals');
    const id = path.split('/').pop();
    expect(stub.get(path)).toEqual({
      id,
      ...goal,
      createdBy: 'mem',
      createdAt: TS,
      updatedAt: TS,
    });
  });

  it('checks the goal fields', async () => {
    const { run, reason } = setup();
    const save = (g: StubData) =>
      run('mem', { action: 'saveGoal', plcId: 'p', goal: g as never });
    expect(await reason(save({ ...goal, title: 'x'.repeat(601) }))).toBe(
      'invalid'
    );
    expect(await reason(save({ ...goal, dueDate: '2026/01/01' }))).toBe(
      'invalid'
    );
    expect(await reason(save({ ...goal, dueDate: '2026-01-01' }))).toBe('ok');
    expect(await reason(save({ ...goal, students: 'x'.repeat(201) }))).toBe(
      'invalid'
    );
    expect(await reason(save({ ...goal, outcome: 'x'.repeat(301) }))).toBe(
      'invalid'
    );
    expect(
      await reason(save({ ...goal, practices: Array(21).fill({ id: 'a' }) }))
    ).toBe('invalid');
    expect(await reason(save({ ...goal, order: 1.5 }))).toBe('invalid');
    expect(await reason(save({ ...goal, progress: { baseline: 101 } }))).toBe(
      'invalid'
    );
    expect(
      await reason(save({ ...goal, progress: { baseline: 10, target: 80 } }))
    ).toBe('ok');
  });

  it('update keeps createdBy and createdAt, clears text, keeps numbers unless progress is sent', async () => {
    const { stub, run, reason } = setup({
      'plcs/p/goals/g1': {
        id: 'g1',
        title: 'Old',
        measure: 'm',
        practices: [],
        order: 0,
        baseline: 10,
        createdBy: 'lead',
        createdAt: 1,
        updatedAt: 1,
      },
    });
    expect(
      await reason(
        run('mem', { action: 'saveGoal', plcId: 'p', goalId: 'g1', goal })
      )
    ).toBe('ok');
    expect(stub.get('plcs/p/goals/g1')).toEqual({
      id: 'g1',
      ...goal,
      baseline: 10,
      createdBy: 'lead',
      createdAt: 1,
      updatedAt: TS,
    });
    await run('mem', {
      action: 'saveGoal',
      plcId: 'p',
      goalId: 'g1',
      goal: { ...goal, progress: { current: 40 } },
    });
    expect(stub.get('plcs/p/goals/g1')?.baseline).toBeUndefined();
    expect(stub.get('plcs/p/goals/g1')?.current).toBe(40);
    expect(
      await reason(
        run('mem', { action: 'saveGoal', plcId: 'p', goalId: 'nope', goal })
      )
    ).toBe('notFound');
  });

  it('non-viewers delete; viewers cannot', async () => {
    const { stub, run, reason } = setup({ 'plcs/p/goals/g1': { id: 'g1' } });
    const del = { action: 'deleteGoal', plcId: 'p', goalId: 'g1' } as const;
    expect(await reason(run('view', del))).toBe('notAllowed');
    expect(await reason(run('mem', del))).toBe('ok');
    expect(stub.has('plcs/p/goals/g1')).toBe(false);
  });
});

describe('links', () => {
  const link = { title: 'Site', url: 'https://a.b', note: '' };

  it('non-viewers add an https link; note is dropped when empty', async () => {
    const { stub, run, reason } = setup();
    const add = (l: StubData, uid = 'mem') =>
      run(uid, { action: 'addLink', plcId: 'p', link: l as never });
    expect(await reason(add(link, 'view'))).toBe('notAllowed');
    expect(await reason(add({ ...link, url: 'http://a.b' }))).toBe('invalid');
    expect(await reason(add({ ...link, title: 'x'.repeat(201) }))).toBe(
      'invalid'
    );
    expect(await reason(add({ ...link, note: 'x'.repeat(501) }))).toBe(
      'invalid'
    );
    expect(await reason(add(link))).toBe('ok');
    const [path] = docsIn(stub, 'links');
    expect(stub.get(path)).toEqual({
      id: path.split('/').pop(),
      title: 'Site',
      url: 'https://a.b',
      createdBy: 'mem',
      createdByName: 'MEM',
      createdAt: TS,
      updatedAt: TS,
    });
  });

  it('non-viewers delete', async () => {
    const { run, reason } = setup({ 'plcs/p/links/l1': {} });
    const del = { action: 'deleteLink', plcId: 'p', linkId: 'l1' } as const;
    expect(await reason(run('view', del))).toBe('notAllowed');
    expect(await reason(run('mem', del))).toBe('ok');
  });
});

describe('mentoring tasks', () => {
  const task = {
    title: 'Observe',
    instructions: 'Watch a lesson',
    dueDate: '2026-12-01',
    submitter: 'mentee',
    templateDoc: null,
  };

  it('facilitators post and delete; members cannot', async () => {
    const { stub, run, reason } = setup();
    const post = { action: 'postTask', plcId: 'p', task } as const;
    expect(await reason(run('mem', post))).toBe('notAllowed');
    expect(await reason(run('co', post))).toBe('ok');
    const [path] = docsIn(stub, 'tasks');
    const id = path.split('/').pop() as string;
    expect(stub.get(path)).toEqual({
      id,
      ...task,
      createdBy: 'co',
      createdAt: TS,
      updatedAt: TS,
    });
    const del = { action: 'deleteTask', plcId: 'p', taskId: id } as const;
    expect(await reason(run('mem', del))).toBe('notAllowed');
    expect(await reason(run('lead', del))).toBe('ok');
  });

  it('checks the task fields', async () => {
    const { run, reason } = setup();
    const post = (t: StubData) =>
      run('lead', { action: 'postTask', plcId: 'p', task: t as never });
    expect(await reason(post({ ...task, title: '' }))).toBe('invalid');
    expect(await reason(post({ ...task, dueDate: 'soon' }))).toBe('invalid');
    expect(await reason(post({ ...task, submitter: 'lead' }))).toBe('invalid');
    expect(
      await reason(post({ ...task, instructions: 'x'.repeat(5001) }))
    ).toBe('invalid');
    expect(
      await reason(
        post({
          ...task,
          templateDoc: { title: 't', url: 'http://x', fileId: 'f' },
        })
      )
    ).toBe('invalid');
    expect(
      await reason(
        post({
          ...task,
          templateDoc: { title: 't', url: 'https://x', fileId: 'f' },
        })
      )
    ).toBe('ok');
  });
});

describe('legacy to-dos', () => {
  it('non-viewers archive existing to-dos with an int tombstone', async () => {
    const { stub, run, reason } = setup({
      'plcs/p/todos/t1': { text: 'a', done: false },
      'plcs/p/todos/t2': { text: 'b', done: true },
    });
    const archive = (ids: string[], uid = 'mem') =>
      run(uid, { action: 'archiveTodos', plcId: 'p', ids });
    expect(await reason(archive(['t1'], 'view'))).toBe('notAllowed');
    expect(await reason(archive(['t1', 'missing']))).toBe('notFound');
    expect(stub.get('plcs/p/todos/t1')?.deletedAt).toBeUndefined();
    expect(await reason(archive(['t1', 't2']))).toBe('ok');
    expect(typeof stub.get('plcs/p/todos/t1')?.deletedAt).toBe('number');
    expect(stub.get('plcs/p/todos/t2')).toMatchObject({
      text: 'b',
      done: true,
    });
  });
});

describe('activity log', () => {
  const event = { type: 'note_created', actorUid: 'view', actorName: 'V' };

  it('any member, viewers included, logs their own event', async () => {
    const { stub, run, reason } = setup();
    const log = (e: StubData, uid = 'view') =>
      run(uid, { action: 'logActivity', plcId: 'p', event: e as never });
    expect(await reason(log(event))).toBe('ok');
    expect(await reason(log(event, 'stranger'))).toBe('notAllowed');
    expect(await reason(log({ ...event, actorUid: 'lead' }))).toBe('invalid');
    expect(await reason(log({ ...event, type: 'hacked' }))).toBe('invalid');
    expect(await reason(log({ ...event, targetId: 5 }))).toBe('invalid');
    const [path] = docsIn(stub, 'activity');
    expect(stub.get(path)).toEqual({
      id: path.split('/').pop(),
      ...event,
      createdAt: TS,
    });
  });
});

describe('caller gates', () => {
  it('a deactivated member, a PIN token or a missing PLC writes nothing', async () => {
    const { run, reason } = setup();
    const post = { action: 'postUpdate', plcId: 'p', draft } as const;
    expect(await reason(run('lead', post, { pinLogin: true }))).toBe(
      'notAllowed'
    );
    expect(await reason(run('lead', post, { deactivated: true }))).toBe(
      'notAllowed'
    );
    deactivated.value = true;
    expect(await reason(run('lead', post))).toBe('notAllowed');
    deactivated.value = false;
    expect(await reason(run('lead', { ...post, plcId: 'missing' }))).toBe(
      'notAllowed'
    );
  });
});

describe('review follow-ups', () => {
  it('counts characters like the rules, not UTF-16 units', async () => {
    const { run, reason } = setup();
    const title = '😀'.repeat(150);
    expect(
      await reason(
        run('lead', {
          action: 'postUpdate',
          plcId: 'p',
          draft: { ...draft, title },
        })
      )
    ).toBe('ok');
  });

  it('trims a long author name to 200 characters', async () => {
    const { stub, run } = setup();
    await run(
      'lead',
      { action: 'postUpdate', plcId: 'p', draft },
      { displayName: 'n'.repeat(250) }
    );
    const [path] = docsIn(stub, 'updates');
    expect((stub.get(path)?.authorName as string).length).toBe(200);
  });

  it('refuses a null template title, a non-string note and a malformed member entry', async () => {
    const { run, reason } = setup({
      'plcs/q': { leadUid: 'x', memberUids: ['mem'], members: { mem: 'bad' } },
    });
    expect(
      await reason(
        run('lead', {
          action: 'postTask',
          plcId: 'p',
          task: {
            title: 't',
            instructions: '',
            dueDate: '2026-12-01',
            submitter: 'both',
            templateDoc: {
              url: 'https://x',
              title: null,
              fileId: null,
            } as never,
          },
        })
      )
    ).toBe('invalid');
    expect(
      await reason(
        run('mem', {
          action: 'addLink',
          plcId: 'p',
          link: { title: 't', url: 'https://a.b', note: 123 as never },
        })
      )
    ).toBe('invalid');
    expect(
      await reason(
        run('mem', { action: 'deleteGoal', plcId: 'q', goalId: 'g' })
      )
    ).toBe('notAllowed');
  });

  it('accepts a goal without order and a task without instructions', async () => {
    const { run, reason } = setup();
    expect(
      await reason(
        run('mem', {
          action: 'saveGoal',
          plcId: 'p',
          goal: { title: 'g', practices: [] } as never,
        })
      )
    ).toBe('ok');
    expect(
      await reason(
        run('lead', {
          action: 'postTask',
          plcId: 'p',
          task: {
            title: 't',
            dueDate: '2026-12-01',
            submitter: 'both',
            templateDoc: null,
          } as never,
        })
      )
    ).toBe('ok');
  });
});
