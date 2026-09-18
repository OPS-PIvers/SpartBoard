import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted so each scenario can reconfigure the firestore/auth surface the
// handler touches (caller role, target member doc, Auth lookup).
const getUserByEmailMock = vi.fn();
const deleteUserMock = vi.fn();
const firestoreMock = vi.fn();
const recursiveDeleteMock = vi.fn();
const deleteFilesMock = vi.fn();
const getFilesMock = vi.fn();

vi.mock('firebase-admin', () => {
  const FieldValue = { serverTimestamp: () => 'ts' };
  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    firestore: Object.assign(() => firestoreMock(), { FieldValue }),
    auth: () => ({
      getUserByEmail: getUserByEmailMock,
      deleteUser: deleteUserMock,
    }),
    storage: () => ({
      bucket: () => ({
        getFiles: getFilesMock,
        deleteFiles: deleteFilesMock,
      }),
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

vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  deleteOrganizationUser,
  classifyBlockers,
  findOtherOrgMemberships,
  parseDeletePayload,
  assertCallerMayDelete,
  DELETE_ROLE_IDS,
  MAX_BLOCKERS_REPORTED,
} from './organizationUserDelete';

type CallableHandler = (request: {
  auth?: { uid: string; token: { email?: string; email_verified?: boolean } };
  data: unknown;
}) => Promise<{
  deleted: boolean;
  blockers: Array<{ kind: string; id: string; label: string }>;
  summary: Record<string, unknown>;
}>;

const handler = deleteOrganizationUser as unknown as CallableHandler;

const SUPER = {
  uid: 'caller',
  token: { email: 'boss@orono.k12.mn.us', email_verified: true },
};

/**
 * Minimal firestore double. `docs` maps a path to its data (absent = missing);
 * queries resolve from `boards` / `plcs`, and counts from `counts`.
 */
function makeDb(opts: {
  docs: Record<string, Record<string, unknown> | undefined>;
  boards?: Array<{ id: string; title?: string }>;
  plcs?: Array<{ id: string; name?: string }>;
  counts?: Record<string, number>;
  subcollections?: string[];
  /** Org ids present on the platform; member docs come from `docs`. */
  orgs?: Array<{ id: string; name?: string }>;
}) {
  const deleted: string[] = [];
  const added: Array<Record<string, unknown>> = [];
  const doc = (path: string) => ({
    get: () =>
      Promise.resolve({
        exists: opts.docs[path] !== undefined,
        get: (field: string) => opts.docs[path]?.[field],
        data: () => opts.docs[path],
      }),
    delete: () => {
      deleted.push(path);
      return Promise.resolve();
    },
    listCollections: () =>
      Promise.resolve(
        (opts.subcollections ?? []).map((id) => ({
          id,
          count: () => ({
            get: () =>
              Promise.resolve({
                data: () => ({ count: opts.counts?.[id] ?? 0 }),
              }),
          }),
        }))
      ),
  });
  const collection = (name: string) => {
    const rows =
      name === 'shared_boards'
        ? (opts.boards ?? []).map((b) => ({
            id: b.id,
            get: (f: string) => (f === 'title' ? b.title : undefined),
          }))
        : name === 'plcs'
          ? (opts.plcs ?? []).map((p) => ({
              id: p.id,
              get: (f: string) => (f === 'name' ? p.name : undefined),
            }))
          : name === 'organizations'
            ? (opts.orgs ?? [{ id: 'orono' }]).map((o) => ({
                id: o.id,
                get: (f: string) => (f === 'name' ? o.name : undefined),
              }))
            : [];
    const q = {
      where: () => q,
      limit: () => q,
      get: () => Promise.resolve({ docs: rows }),
      count: () => ({
        get: () =>
          Promise.resolve({
            data: () => ({ count: opts.counts?.[name] ?? 0 }),
          }),
      }),
    };
    return {
      ...q,
      doc,
      add: (payload: Record<string, unknown>) => {
        added.push(payload);
        return Promise.resolve({ id: 'log1' });
      },
    };
  };
  return {
    db: { doc, collection, recursiveDelete: recursiveDeleteMock },
    deleted,
    added,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  recursiveDeleteMock.mockResolvedValue(undefined);
  deleteFilesMock.mockResolvedValue(undefined);
  getFilesMock.mockResolvedValue([[]]);
  deleteUserMock.mockResolvedValue(undefined);
});

describe('parseDeletePayload', () => {
  it('lowercases the target email', () => {
    expect(
      parseDeletePayload({ orgId: 'orono', email: 'A@B.com', dryRun: true })
    ).toEqual({ orgId: 'orono', email: 'a@b.com', dryRun: true });
  });

  it('defaults dryRun to false so an omitted flag never silently no-ops', () => {
    expect(
      parseDeletePayload({ orgId: 'orono', email: 'a@b.com' }).dryRun
    ).toBe(false);
  });

  it.each([
    ['non-object', 'nope'],
    ['missing orgId', { email: 'a@b.com' }],
    ['missing email', { orgId: 'orono' }],
  ])('rejects %s', (_label, data) => {
    expect(() => parseDeletePayload(data)).toThrow();
  });
});

describe('findOtherOrgMemberships', () => {
  it('returns orgs other than the target one that still carry a member doc', async () => {
    const { db } = makeDb({
      orgs: [{ id: 'orono' }, { id: 'other', name: 'Other District' }],
      docs: { 'organizations/other/members/t@x.com': { roleId: 'teacher' } },
    });
    await expect(
      findOtherOrgMemberships(db as never, 'orono', 't@x.com')
    ).resolves.toEqual([{ id: 'other', name: 'Other District' }]);
  });

  it('ignores the org the delete is running for', async () => {
    const { db } = makeDb({
      orgs: [{ id: 'orono' }],
      docs: { 'organizations/orono/members/t@x.com': { roleId: 'teacher' } },
    });
    await expect(
      findOtherOrgMemberships(db as never, 'orono', 't@x.com')
    ).resolves.toEqual([]);
  });
});

describe('classifyBlockers', () => {
  it('labels both kinds and falls back for untitled content', () => {
    expect(
      classifyBlockers(
        [{ id: 'b1' }, { id: 'b2', title: 'Unit 3' }],
        [{ id: 'p1', name: 'ELA 9' }]
      )
    ).toEqual([
      { kind: 'shared_board', id: 'b1', label: 'Untitled board' },
      { kind: 'shared_board', id: 'b2', label: 'Unit 3' },
      { kind: 'plc', id: 'p1', label: 'ELA 9' },
    ]);
  });

  it('caps the report so one teacher cannot return an unbounded payload', () => {
    const many = Array.from({ length: MAX_BLOCKERS_REPORTED + 10 }, (_, i) => ({
      id: `b${i}`,
    }));
    expect(classifyBlockers(many, [])).toHaveLength(MAX_BLOCKERS_REPORTED);
  });

  it('returns nothing when the user owns no shared content', () => {
    expect(classifyBlockers([], [])).toEqual([]);
  });

  it('lists another org membership first — the widest blast radius', () => {
    expect(
      classifyBlockers(
        [{ id: 'b1', title: 'Unit 3' }],
        [],
        [{ id: 'other', name: 'Other District' }]
      )[0]
    ).toEqual({
      kind: 'org_membership',
      id: 'other',
      label: 'Other District',
    });
  });

  it('falls back to the org id when the org has no name', () => {
    expect(classifyBlockers([], [], [{ id: 'other' }])[0]?.label).toBe('other');
  });
});

describe('assertCallerMayDelete', () => {
  it('admits a super_admin member of the operator org', async () => {
    const { db } = makeDb({
      docs: { 'organizations/orono/members/boss@x': { roleId: 'super_admin' } },
    });
    await expect(
      assertCallerMayDelete(db as never, 'boss@x')
    ).resolves.toBeUndefined();
  });

  it('ignores a super_admin roleId held in a NON-operator org', async () => {
    // firestore.rules reads isMemberSuperAdmin() from `organizations/orono`
    // by fixed path, so a super_admin roleId elsewhere grants nothing. This
    // callable must not be the one place that honours it.
    const { db } = makeDb({
      docs: {
        'organizations/other/members/imposter@x': { roleId: 'super_admin' },
        'admin_settings/user_roles': { superAdmins: [] },
      },
    });
    await expect(
      assertCallerMayDelete(db as never, 'imposter@x')
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a domain_admin — narrower than the rest of the panel', async () => {
    expect(DELETE_ROLE_IDS).not.toContain('domain_admin');
    const { db } = makeDb({
      docs: {
        'organizations/orono/members/dom@x': { roleId: 'domain_admin' },
        'admin_settings/user_roles': { superAdmins: [] },
      },
    });
    await expect(
      assertCallerMayDelete(db as never, 'dom@x')
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('admits a legacy superAdmins entry with no member doc', async () => {
    const { db } = makeDb({
      docs: { 'admin_settings/user_roles': { superAdmins: ['legacy@x'] } },
    });
    await expect(
      assertCallerMayDelete(db as never, 'legacy@x')
    ).resolves.toBeUndefined();
  });

  it('rejects a non-member', async () => {
    const { db } = makeDb({ docs: {} });
    await expect(
      assertCallerMayDelete(db as never, 'nobody@x')
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('deleteOrganizationUser — guards', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(
      handler({ data: { orgId: 'orono', email: 'a@b.com' } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects an unverified caller email', async () => {
    await expect(
      handler({
        auth: { uid: 'c', token: { email: 'a@b.com', email_verified: false } },
        data: { orgId: 'orono', email: 'x@y.com' },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses self-deletion so an org cannot be left unadministered', async () => {
    const { db } = makeDb({
      docs: {
        'organizations/orono/members/boss@orono.k12.mn.us': {
          roleId: 'super_admin',
        },
      },
    });
    firestoreMock.mockReturnValue(db);
    await expect(
      handler({
        auth: SUPER,
        data: { orgId: 'orono', email: 'boss@orono.k12.mn.us' },
      })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects a target with no member doc', async () => {
    const { db } = makeDb({
      docs: {
        'organizations/orono/members/boss@orono.k12.mn.us': {
          roleId: 'super_admin',
        },
      },
    });
    firestoreMock.mockReturnValue(db);
    await expect(
      handler({ auth: SUPER, data: { orgId: 'orono', email: 'ghost@x.com' } })
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('deleteOrganizationUser — preflight and execution', () => {
  const baseDocs = {
    'organizations/orono/members/boss@orono.k12.mn.us': {
      roleId: 'super_admin',
    },
    'organizations/orono/members/teacher@orono.k12.mn.us': {
      roleId: 'teacher',
    },
  };
  const target = { orgId: 'orono', email: 'teacher@orono.k12.mn.us' };

  it('dryRun reports counts and destroys nothing', async () => {
    const { db } = makeDb({
      docs: { ...baseDocs, 'users/uid9': { email: 'teacher@orono.k12.mn.us' } },
      subcollections: ['dashboards', 'quizzes'],
      counts: { dashboards: 2, quizzes: 5, quiz_sessions: 3 },
    });
    firestoreMock.mockReturnValue(db);
    getUserByEmailMock.mockResolvedValue({ uid: 'uid9' });
    getFilesMock.mockResolvedValue([[{ name: 'a' }, { name: 'b' }]]);

    const res = await handler({
      auth: SUPER,
      data: { ...target, dryRun: true },
    });

    expect(res.deleted).toBe(false);
    expect(res.summary).toMatchObject({
      uid: 'uid9',
      userDocsFound: 8, // root doc + 2 dashboards + 5 quizzes
      storageObjectsFound: 2,
      quizSessionsPreserved: 3,
    });
    expect(recursiveDeleteMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it('refuses to delete while shared boards or PLCs reference the user', async () => {
    const { db, deleted } = makeDb({
      docs: { ...baseDocs, 'users/uid9': {} },
      boards: [{ id: 'b1', title: 'Unit 3' }],
      plcs: [{ id: 'p1', name: 'ELA 9' }],
    });
    firestoreMock.mockReturnValue(db);
    getUserByEmailMock.mockResolvedValue({ uid: 'uid9' });

    const res = await handler({ auth: SUPER, data: target });

    expect(res.deleted).toBe(false);
    expect(res.blockers).toHaveLength(2);
    expect(recursiveDeleteMock).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });

  it('refuses while the target still belongs to another organization', async () => {
    // `/users/{uid}` is global, so deleting for org A would wipe org B's data.
    const { db, deleted } = makeDb({
      orgs: [{ id: 'orono' }, { id: 'other', name: 'Other District' }],
      docs: {
        ...baseDocs,
        'users/uid9': {},
        'organizations/other/members/teacher@orono.k12.mn.us': {
          roleId: 'teacher',
        },
      },
    });
    firestoreMock.mockReturnValue(db);
    getUserByEmailMock.mockResolvedValue({ uid: 'uid9' });

    const res = await handler({ auth: SUPER, data: target });

    expect(res.deleted).toBe(false);
    expect(res.blockers).toContainEqual({
      kind: 'org_membership',
      id: 'other',
      label: 'Other District',
    });
    expect(recursiveDeleteMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
  });

  it('deletes the tree, Storage, Auth and the member doc — member doc last', async () => {
    const { db, deleted, added } = makeDb({
      docs: {
        ...baseDocs,
        'users/uid9': {},
        'admins/teacher@orono.k12.mn.us': { roleId: 'building_admin' },
      },
      counts: { quiz_sessions: 4 },
    });
    firestoreMock.mockReturnValue(db);
    getUserByEmailMock.mockResolvedValue({ uid: 'uid9' });

    const res = await handler({ auth: SUPER, data: target });

    expect(res.deleted).toBe(true);
    expect(recursiveDeleteMock).toHaveBeenCalledTimes(1);
    expect(deleteFilesMock).toHaveBeenCalledWith({ prefix: 'users/uid9/' });
    expect(deleteUserMock).toHaveBeenCalledWith('uid9');
    expect(res.summary).toMatchObject({
      memberDocRemoved: true,
      adminDocRemoved: true,
      authAccountRemoved: true,
      quizSessionsPreserved: 4,
    });
    // The member doc is the authorization anchor for a retry, so it goes last.
    expect(deleted[deleted.length - 1]).toBe(
      'organizations/orono/members/teacher@orono.k12.mn.us'
    );
    expect(added[0]).toMatchObject({
      action: 'user_account_deleted',
      targetEmail: 'teacher@orono.k12.mn.us',
      quizSessionsPreserved: 4,
    });
  });

  it('never deletes quiz_sessions — student work outlives the teacher', async () => {
    const { db } = makeDb({
      docs: { ...baseDocs, 'users/uid9': {} },
      counts: { quiz_sessions: 12 },
    });
    firestoreMock.mockReturnValue(db);
    getUserByEmailMock.mockResolvedValue({ uid: 'uid9' });

    const res = await handler({ auth: SUPER, data: target });

    expect(res.summary.quizSessionsPreserved).toBe(12);
    // recursiveDelete is scoped to the user tree and nothing else.
    expect(recursiveDeleteMock).toHaveBeenCalledTimes(1);
  });

  it('handles a member who never signed in (no Auth account)', async () => {
    const { db, deleted } = makeDb({ docs: baseDocs });
    firestoreMock.mockReturnValue(db);
    getUserByEmailMock.mockRejectedValue({ code: 'auth/user-not-found' });

    const res = await handler({ auth: SUPER, data: target });

    expect(res.deleted).toBe(true);
    expect(res.summary).toMatchObject({ uid: null, authAccountRemoved: false });
    expect(recursiveDeleteMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(deleted).toContain(
      'organizations/orono/members/teacher@orono.k12.mn.us'
    );
  });

  it('keeps the member doc and throws when the Auth delete fails', async () => {
    const { db, deleted } = makeDb({
      docs: { ...baseDocs, 'users/uid9': {} },
    });
    firestoreMock.mockReturnValue(db);
    getUserByEmailMock.mockResolvedValue({ uid: 'uid9' });
    deleteUserMock.mockRejectedValue(new Error('auth down'));

    // Reporting success here would leave an account that can still sign in
    // while the row disappears from the roster — unrecoverable via the UI.
    await expect(handler({ auth: SUPER, data: target })).rejects.toMatchObject({
      code: 'internal',
    });
    // The member doc is the retry anchor, so it must survive.
    expect(deleted).not.toContain(
      'organizations/orono/members/teacher@orono.k12.mn.us'
    );
  });

  it('treats an already-missing Auth account as deleted, so a retry completes', async () => {
    const { db, deleted } = makeDb({
      docs: { ...baseDocs, 'users/uid9': {} },
    });
    firestoreMock.mockReturnValue(db);
    getUserByEmailMock.mockResolvedValue({ uid: 'uid9' });
    deleteUserMock.mockRejectedValue({ code: 'auth/user-not-found' });

    const res = await handler({ auth: SUPER, data: target });

    expect(res.deleted).toBe(true);
    expect(res.summary.authAccountRemoved).toBe(true);
    expect(deleted).toContain(
      'organizations/orono/members/teacher@orono.k12.mn.us'
    );
  });
});
