/**
 * Tests for `commitProjectGroupsV1` — the Projects widget's group import
 * (docs/plans/shipped/PROJECTS_WIDGET.md D8/D9/D10).
 *
 * The invariants that matter here are the ones a teacher's tracked work rests
 * on: only the run's own teacher may write, `memberUids` are the real HMAC
 * pseudonyms (`./classlinkShared` is deliberately left unmocked so the
 * assertions exercise the production derivation), and a re-import that names an
 * existing group moves its membership without touching its step states.
 */

/* eslint-disable @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-return,
   @typescript-eslint/require-await -- the hand-rolled Firestore mock trades
   exact SDK types for readability, mirroring studentIdentity.test.ts. Its
   async mock methods return Promise-shaped values without awaiting, matching
   the async production APIs. Production code is type-checked against the real
   firebase-admin types separately. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as CryptoJS from 'crypto-js';

const h = vi.hoisted(() => ({
  hmacSecret: 'test-hmac-secret',
  docStore: new Map<string, any>(),
  writes: [] as Array<{
    type: 'set' | 'update' | 'delete';
    path: string;
    data?: any;
  }>,
  recursiveDeletes: [] as string[],
  // classId -> sourcedIds ClassLink enrolls; absent = the caller does not teach it.
  enrollment: new Map<string, Set<string>>(),
  enrollmentLookups: [] as Array<{ email: string; classId: string }>,
  enrollmentDown: false,
}));

vi.mock('./functionsInit', () => ({}));

vi.mock('./secrets', () => ({
  STUDENT_PSEUDONYM_HMAC_SECRET: { value: () => h.hmacSecret },
  CLASSLINK_CLIENT_ID: { value: () => '' },
  CLASSLINK_CLIENT_SECRET: { value: () => '' },
  CLASSLINK_TENANT_URL: { value: () => '' },
}));

vi.mock('./studentIdentity', () => ({
  loadTaughtClassEnrollment: async (email: string, classId: string) => {
    h.enrollmentLookups.push({ email, classId });
    if (h.enrollmentDown) throw new Error('classlink down');
    return h.enrollment.get(classId) ?? null;
  },
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
    // Return the bare handler so tests invoke it directly.
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

vi.mock('./firebaseAdmin', () => {
  const snapFor = (path: string) => {
    const data = h.docStore.get(path);
    return {
      id: path.split('/').pop(),
      exists: data !== undefined,
      data: () => data,
      get: (field: string) => data?.[field],
    };
  };
  const docRef = (path: string): any => ({
    _path: path,
    get: async () => snapFor(path),
    collection: (name: string) => collRef(`${path}/${name}`),
  });
  const collRef = (path: string): any => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    select: () => ({
      get: async () => ({
        docs: [...h.docStore.keys()]
          .filter(
            (key) =>
              key.startsWith(`${path}/`) &&
              !key.slice(path.length + 1).includes('/')
          )
          .map((key) => snapFor(key)),
      }),
    }),
  });
  // The org lookup behind the test-class gate: domain '@school.org' → 'org-1'.
  const domainsQuery = (domain: string): any => ({
    where: (_f: string, _op: string, value: string) =>
      value === 'verified' ? domainsQuery(domain) : domainsQuery(value),
    limit: () => domainsQuery(domain),
    get: async () =>
      domain === '@school.org'
        ? {
            empty: false,
            docs: [
              {
                ref: {
                  path: 'organizations/org-1/domains/d',
                  parent: { parent: { id: 'org-1' } },
                },
              },
            ],
          }
        : { empty: true, docs: [] },
  });
  const db: any = {
    collection: (name: string) => collRef(name),
    doc: (path: string) => docRef(path),
    collectionGroup: () => domainsQuery(''),
    getAll: async (...refs: any[]) => refs.map((r) => snapFor(r._path)),
    batch: () => ({
      set: (ref: any, data: any) =>
        h.writes.push({ type: 'set', path: ref._path, data }),
      update: (ref: any, data: any) =>
        h.writes.push({ type: 'update', path: ref._path, data }),
      delete: (ref: any) => h.writes.push({ type: 'delete', path: ref._path }),
      commit: async () => {
        for (const w of h.writes) {
          if (w.type === 'delete') {
            h.docStore.delete(w.path);
            continue;
          }
          h.docStore.set(
            w.path,
            w.type === 'set'
              ? w.data
              : { ...(h.docStore.get(w.path) ?? {}), ...w.data }
          );
        }
      },
    }),
    recursiveDelete: async (ref: any) => {
      h.recursiveDeletes.push(ref._path);
      for (const key of [...h.docStore.keys()]) {
        if (key === ref._path || key.startsWith(`${ref._path}/`)) {
          h.docStore.delete(key);
        }
      }
    },
  };
  return { firestore: () => db };
});

import { commitProjectGroupsV1 } from './projectGroups';

const TEACHER = 'teacher-1';
const RUN_ID = `${TEACHER}_project-1`;
const RUN_PATH = `project_runs/${RUN_ID}`;

const TEACHER_AUTH = {
  uid: TEACHER,
  token: { email: 'teacher@school.org', email_verified: true },
};

const call = (data: unknown, auth: unknown = TEACHER_AUTH) =>
  (commitProjectGroupsV1 as unknown as (req: unknown) => Promise<any>)({
    data,
    auth,
  });

const TEST_CLASS_PATH = 'organizations/org-1/testClasses/mock-class';
const ADMIN_AUTH = { uid: TEACHER, token: { email: 'paul@school.org' } };
const expectedTestUid = (email: string) =>
  CryptoJS.HmacSHA256(`sid:test:${email}`, h.hmacSecret).toString(
    CryptoJS.enc.Hex
  );

const expectedUid = (sourcedId: string) =>
  CryptoJS.HmacSHA256(`sid:${sourcedId}`, h.hmacSecret).toString(
    CryptoJS.enc.Hex
  );

const groupEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'Group 1',
  classId: 'class-a',
  order: 0,
  classLinkSourcedIds: ['SID-1', 'SID-2'],
  ...overrides,
});

beforeEach(() => {
  h.docStore.clear();
  h.writes.length = 0;
  h.recursiveDeletes.length = 0;
  h.hmacSecret = 'test-hmac-secret';
  h.enrollment.clear();
  for (const classId of ['class-a', 'class-b']) {
    h.enrollment.set(
      classId,
      new Set(Array.from({ length: 60 }, (_, i) => `SID-${i}`))
    );
  }
  h.enrollmentLookups.length = 0;
  h.enrollmentDown = false;
  h.docStore.set(RUN_PATH, {
    id: RUN_ID,
    teacherUid: TEACHER,
    steps: [{ id: 'step-1' }, { id: 'step-2' }],
    classIds: [],
  });
});

describe('commitProjectGroupsV1 access', () => {
  it('rejects an unauthenticated caller', async () => {
    await expect(
      call({ runId: RUN_ID, groups: [groupEntry()] }, null)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects a student-role caller', async () => {
    await expect(
      call(
        { runId: RUN_ID, groups: [groupEntry()] },
        {
          uid: 'student-1',
          token: { studentRole: true },
        }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it("rejects another teacher's run", async () => {
    await expect(
      call(
        { runId: RUN_ID, groups: [groupEntry()] },
        {
          uid: 'teacher-2',
          token: {},
        }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a run that does not exist', async () => {
    await expect(
      call({ runId: 'teacher-1_missing', groups: [groupEntry()] })
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('commitProjectGroupsV1 input validation', () => {
  it.each([
    [{ runId: '', groups: [groupEntry()] }],
    [{ runId: RUN_ID, groups: 'nope' }],
    [{ runId: RUN_ID, groups: [] }],
    [{ runId: RUN_ID, groups: [groupEntry({ name: '' })] }],
    [{ runId: RUN_ID, groups: [groupEntry({ classId: '' })] }],
  ])('rejects %j', async (payload) => {
    await expect(call(payload)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  // A `/` in an id makes `.doc()` throw before any of the checks above run, so
  // these have to be rejected by format, not just by emptiness.
  it.each([
    [{ runId: 'teacher-1/run', groups: [groupEntry()] }],
    [{ runId: '..', groups: [groupEntry()] }],
    [{ runId: '__name__', groups: [groupEntry()] }],
    [{ runId: RUN_ID, groups: [groupEntry({ id: 'a/b' })] }],
    [{ runId: RUN_ID, groups: [groupEntry({ id: '.' })] }],
    [{ runId: RUN_ID, groups: [groupEntry({ id: 'x'.repeat(1501) })] }],
  ])('rejects a crafted document id %j', async (payload) => {
    await expect(call(payload)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejects more groups than the ceiling allows', async () => {
    const groups = Array.from({ length: 33 }, (_, i) =>
      groupEntry({ id: `g${i}` })
    );
    await expect(call({ runId: RUN_ID, groups })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejects a group with more members than the ceiling allows', async () => {
    const classLinkSourcedIds = Array.from(
      { length: 41 },
      (_, i) => `SID-${i}`
    );
    await expect(
      call({ runId: RUN_ID, groups: [groupEntry({ classLinkSourcedIds })] })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('commitProjectGroupsV1 writes', () => {
  it('mints member uids with the shared HMAC pseudonym', async () => {
    const result = await call({ runId: RUN_ID, groups: [groupEntry()] });
    const written = h.docStore.get(`${RUN_PATH}/groups/g1`);
    expect(written.memberUids).toEqual([
      expectedUid('SID-1'),
      expectedUid('SID-2'),
    ]);
    expect(result.membersResolved).toBe(2);
    expect(result.groupsCreated).toBe(1);
  });

  it('seeds every step at notStarted on a new group', async () => {
    await call({ runId: RUN_ID, groups: [groupEntry()] });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).stepStates).toEqual({
      'step-1': 'notStarted',
      'step-2': 'notStarted',
    });
  });

  it('drops duplicate sourcedIds and blank entries', async () => {
    await call({
      runId: RUN_ID,
      groups: [
        groupEntry({ classLinkSourcedIds: ['SID-1', 'SID-1', '', 'SID-2'] }),
      ],
    });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([
      expectedUid('SID-1'),
      expectedUid('SID-2'),
    ]);
  });

  it('adds each group class to the run without duplicating one', async () => {
    h.docStore.set(RUN_PATH, {
      ...h.docStore.get(RUN_PATH),
      classIds: ['class-a'],
    });
    const result = await call({
      runId: RUN_ID,
      groups: [groupEntry(), groupEntry({ id: 'g2', classId: 'class-b' })],
    });
    expect(result.classIds).toEqual(['class-a', 'class-b']);
  });

  it('writes an optional color and drops one that is not a palette class', async () => {
    await call({
      runId: RUN_ID,
      groups: [
        groupEntry({ color: 'bg-sky-500' }),
        groupEntry({ id: 'g2', color: 'url(javascript:alert(1))' }),
      ],
    });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).color).toBe('bg-sky-500');
    expect(h.docStore.get(`${RUN_PATH}/groups/g2`)).not.toHaveProperty('color');
  });

  it('never stamps a peer-visibility field on a group', async () => {
    h.docStore.set(RUN_PATH, {
      ...h.docStore.get(RUN_PATH),
      showStatusToStudents: true,
    });
    await call({ runId: RUN_ID, groups: [groupEntry()] });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`)).not.toHaveProperty(
      'peerVisible'
    );
  });

  it('merges class names onto the run for classes that have groups', async () => {
    h.docStore.set(RUN_PATH, {
      ...h.docStore.get(RUN_PATH),
      classNames: { 'class-a': 'Old name', 'class-z': 'Gone' },
    });
    await call({
      runId: RUN_ID,
      groups: [groupEntry(), groupEntry({ id: 'g2', classId: 'class-b' })],
      classNames: { 'class-b': ' Period 2 ', 'class-c': 'No groups' },
    });
    expect(h.docStore.get(RUN_PATH).classNames).toEqual({
      'class-a': 'Old name',
      'class-b': 'Period 2',
    });
  });

  it('moves membership on a re-import without touching tracked progress', async () => {
    h.docStore.set(`${RUN_PATH}/groups/g1`, {
      id: 'g1',
      name: 'Group 1',
      classId: 'class-a',
      memberUids: [expectedUid('SID-1')],
      order: 0,
      stepStates: { 'step-1': 'done', 'step-2': 'readyForReview' },
      color: 'bg-rose-500',
      workLinks: [{ id: 'l1', url: 'https://example.com' }],
      updatedAt: 1,
    });

    const result = await call({
      runId: RUN_ID,
      groups: [groupEntry({ classLinkSourcedIds: ['SID-1', 'SID-3'] })],
    });

    const written = h.writes.find((w) => w.path.endsWith('/groups/g1'));
    expect(written?.type).toBe('update');
    expect(written?.data).not.toHaveProperty('stepStates');
    expect(written?.data).not.toHaveProperty('color');
    expect(written?.data).not.toHaveProperty('workLinks');

    const after = h.docStore.get(`${RUN_PATH}/groups/g1`);
    expect(after.memberUids).toEqual([
      expectedUid('SID-1'),
      expectedUid('SID-3'),
    ]);
    expect(after.stepStates).toEqual({
      'step-1': 'done',
      'step-2': 'readyForReview',
    });
    expect(after.color).toBe('bg-rose-500');
    expect(after.workLinks).toHaveLength(1);
    expect(result.groupsCreated).toBe(0);
  });

  it('keeps a group with no resolvable students, with no members', async () => {
    await call({
      runId: RUN_ID,
      groups: [groupEntry({ classLinkSourcedIds: [] })],
    });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([]);
  });

  it('fails closed when the pseudonym secret is missing', async () => {
    h.hmacSecret = '';
    await expect(
      call({ runId: RUN_ID, groups: [groupEntry()] })
    ).rejects.toMatchObject({ code: 'internal' });
  });
});

describe('commitProjectGroupsV1 ClassLink check', () => {
  const expectNothingWritten = () => {
    expect(h.writes).toEqual([]);
    expect(h.docStore.has(`${RUN_PATH}/groups/g1`)).toBe(false);
  };

  it('mints no uid for a class the caller does not teach', async () => {
    h.enrollment.clear();
    await expect(
      call({ runId: RUN_ID, groups: [groupEntry()] })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expectNothingWritten();
  });

  it('mints no uid for a sourcedId the class does not enroll', async () => {
    h.enrollment.set('class-a', new Set(['SID-1']));
    const result = await call({
      runId: RUN_ID,
      groups: [groupEntry({ classLinkSourcedIds: ['SID-1', 'SID-foreign'] })],
    });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([
      expectedUid('SID-1'),
    ]);
    expect(result.membersResolved).toBe(1);
  });

  it.each([
    ['an unverified email', { email: 't@school.org', email_verified: false }],
    ['no email', {}],
    [
      'a students domain address',
      { email: 'kid@students.school.org', email_verified: true },
    ],
    [
      'an anonymous sign-in',
      {
        email: 't@school.org',
        email_verified: true,
        firebase: { sign_in_provider: 'anonymous' },
      },
    ],
  ])('refuses sourcedIds from a caller with %s', async (_label, token) => {
    await expect(
      call({ runId: RUN_ID, groups: [groupEntry()] }, { uid: TEACHER, token })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.enrollmentLookups).toEqual([]);
    expectNothingWritten();
  });

  it('fails the commit, without writing, when ClassLink cannot answer', async () => {
    h.enrollmentDown = true;
    await expect(
      call({ runId: RUN_ID, groups: [groupEntry()] })
    ).rejects.toThrow('classlink down');
    expectNothingWritten();
  });

  it('checks each class once with the caller email', async () => {
    await call({
      runId: RUN_ID,
      groups: [
        groupEntry({ id: 'g1' }),
        groupEntry({ id: 'g2', classLinkSourcedIds: ['SID-3'] }),
        groupEntry({
          id: 'g3',
          classId: 'class-b',
          classLinkSourcedIds: ['SID-9'],
        }),
      ],
    });
    expect(h.enrollmentLookups.map((l) => l.classId).sort()).toEqual([
      'class-a',
      'class-b',
    ]);
    expect(h.enrollmentLookups[0].email).toBe('teacher@school.org');
  });

  it('needs no ClassLink check when a group imports no students', async () => {
    h.enrollment.clear();
    await call({
      runId: RUN_ID,
      groups: [groupEntry({ classLinkSourcedIds: [] })],
    });
    expect(h.enrollmentLookups).toEqual([]);
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([]);
  });
});

describe('commitProjectGroupsV1 test-class members', () => {
  const testGroup = (overrides: Record<string, unknown> = {}) =>
    groupEntry({
      classId: 'mock-class',
      classLinkSourcedIds: [],
      testEmails: ['Kid.One@school.org', 'kid.two@school.org'],
      ...overrides,
    });

  beforeEach(() => {
    h.docStore.set(TEST_CLASS_PATH, {
      memberEmails: ['kid.one@school.org', 'kid.two@school.org'],
    });
    h.docStore.set('organizations/org-1/members/paul@school.org', {
      roleId: 'domain_admin',
    });
  });

  it('mints the uid a test-class sign-in carries', async () => {
    const result = await call(
      { runId: RUN_ID, groups: [testGroup()] },
      ADMIN_AUTH
    );
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([
      expectedTestUid('kid.one@school.org'),
      expectedTestUid('kid.two@school.org'),
    ]);
    expect(result.membersResolved).toBe(2);
    expect(result.classIds).toEqual(['mock-class']);
  });

  it('drops an email that is not in the named test class', async () => {
    await call(
      {
        runId: RUN_ID,
        groups: [testGroup({ testEmails: ['kid.one@school.org', 'x@y.org'] })],
      },
      ADMIN_AUTH
    );
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([
      expectedTestUid('kid.one@school.org'),
    ]);
  });

  it('places no test students for a caller who does not administer test classes', async () => {
    h.docStore.delete('organizations/org-1/members/paul@school.org');
    const result = await call(
      { runId: RUN_ID, groups: [testGroup()] },
      ADMIN_AUTH
    );
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([]);
    expect(result.membersResolved).toBe(0);
  });

  it('counts test emails toward the member ceiling', async () => {
    const testEmails = Array.from({ length: 21 }, (_, i) => `k${i}@school.org`);
    const classLinkSourcedIds = Array.from({ length: 20 }, (_, i) => `S${i}`);
    await expect(
      call(
        {
          runId: RUN_ID,
          groups: [testGroup({ testEmails, classLinkSourcedIds })],
        },
        ADMIN_AUTH
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('commitProjectGroupsV1 edits and deletes', () => {
  const seedGroup = (id: string, memberUids: string[]) =>
    h.docStore.set(`${RUN_PATH}/groups/${id}`, {
      id,
      name: id,
      classId: 'class-a',
      memberUids,
      order: 0,
      stepStates: { 'step-1': 'done' },
      updatedAt: 1,
    });

  it('keeps a stored member the client could not name', async () => {
    seedGroup('g1', ['unnamed-uid']);
    await call({
      runId: RUN_ID,
      groups: [
        groupEntry({
          classLinkSourcedIds: ['SID-1'],
          keepMemberUids: ['unnamed-uid'],
        }),
      ],
    });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([
      'unnamed-uid',
      expectedUid('SID-1'),
    ]);
  });

  it('drops a kept uid that is not already on the group', async () => {
    seedGroup('g1', ['unnamed-uid']);
    await call({
      runId: RUN_ID,
      groups: [
        groupEntry({
          classLinkSourcedIds: [],
          keepMemberUids: ['unnamed-uid', 'someone-else'],
        }),
      ],
    });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([
      'unnamed-uid',
    ]);
  });

  it('never keeps a uid on a brand-new group', async () => {
    await call({
      runId: RUN_ID,
      groups: [
        groupEntry({ classLinkSourcedIds: [], keepMemberUids: ['forged'] }),
      ],
    });
    expect(h.docStore.get(`${RUN_PATH}/groups/g1`).memberUids).toEqual([]);
  });

  it('deletes a group with its grade and subcollections', async () => {
    seedGroup('g1', ['u1']);
    seedGroup('g2', ['u2']);
    h.docStore.set(`${RUN_PATH}/groups/g1/uploads/up1`, { id: 'up1' });
    h.docStore.set(`${RUN_PATH}/grades/g1`, { groupId: 'g1' });

    const result = await call({
      runId: RUN_ID,
      groups: [],
      deleteGroupIds: ['g1'],
    });

    expect(result.groupsDeleted).toBe(1);
    expect(h.recursiveDeletes).toEqual([`${RUN_PATH}/groups/g1`]);
    expect(h.docStore.has(`${RUN_PATH}/groups/g1`)).toBe(false);
    expect(h.docStore.has(`${RUN_PATH}/groups/g1/uploads/up1`)).toBe(false);
    expect(h.docStore.has(`${RUN_PATH}/grades/g1`)).toBe(false);
    expect(h.docStore.has(`${RUN_PATH}/groups/g2`)).toBe(true);
  });

  it('drops a class from the run with its last group', async () => {
    h.docStore.set(RUN_PATH, {
      ...h.docStore.get(RUN_PATH),
      classIds: ['class-a', 'class-b'],
      classNames: { 'class-a': 'Period 1', 'class-b': 'Period 2' },
    });
    seedGroup('g1', ['u1']);
    h.docStore.set(`${RUN_PATH}/groups/g2`, {
      id: 'g2',
      classId: 'class-b',
      memberUids: [],
    });

    const result = await call({
      runId: RUN_ID,
      groups: [],
      deleteGroupIds: ['g2'],
    });

    expect(result.classIds).toEqual(['class-a']);
    expect(h.docStore.get(RUN_PATH).classIds).toEqual(['class-a']);
    expect(h.docStore.get(RUN_PATH).classNames).toEqual({
      'class-a': 'Period 1',
    });
  });

  it('moves a class off the run when its only group changes class', async () => {
    h.docStore.set(RUN_PATH, {
      ...h.docStore.get(RUN_PATH),
      classIds: ['class-a'],
    });
    seedGroup('g1', []);
    const result = await call({
      runId: RUN_ID,
      groups: [groupEntry({ classId: 'class-b', classLinkSourcedIds: [] })],
    });
    expect(result.classIds).toEqual(['class-b']);
  });

  it('refuses a delete from someone other than the run teacher', async () => {
    seedGroup('g1', ['u1']);
    await expect(
      call(
        { runId: RUN_ID, groups: [], deleteGroupIds: ['g1'] },
        { uid: 'teacher-2', token: {} }
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.docStore.has(`${RUN_PATH}/groups/g1`)).toBe(true);
  });

  it.each([
    [{ runId: RUN_ID, groups: [], deleteGroupIds: ['a/b'] }],
    [{ runId: RUN_ID, groups: [], deleteGroupIds: 'g1' }],
    [{ runId: RUN_ID, groups: [groupEntry()], deleteGroupIds: ['g1'] }],
    [{ runId: RUN_ID, groups: [], deleteGroupIds: [] }],
  ])('rejects %j', async (payload) => {
    await expect(call(payload)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
