/**
 * Tests for `commitProjectGroupsV1` — the Projects widget's group import
 * (docs/plans/PROJECTS_WIDGET.md D8/D9/D10).
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
  hmacSecret: 'test-hmac-secret' as string,
  docStore: new Map<string, any>(),
  writes: [] as Array<{ type: 'set' | 'update'; path: string; data: any }>,
}));

vi.mock('./functionsInit', () => ({}));

vi.mock('./secrets', () => ({
  STUDENT_PSEUDONYM_HMAC_SECRET: { value: () => h.hmacSecret },
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

vi.mock('firebase-admin', () => {
  const snapFor = (path: string) => {
    const data = h.docStore.get(path);
    return {
      id: path.split('/').pop(),
      exists: data !== undefined,
      data: () => data,
    };
  };
  const docRef = (path: string): any => ({
    _path: path,
    get: async () => snapFor(path),
    collection: (name: string) => collRef(`${path}/${name}`),
  });
  const collRef = (path: string): any => ({
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  const db: any = {
    collection: (name: string) => collRef(name),
    getAll: async (...refs: any[]) => refs.map((r) => snapFor(r._path)),
    batch: () => ({
      set: (ref: any, data: any) =>
        h.writes.push({ type: 'set', path: ref._path, data }),
      update: (ref: any, data: any) =>
        h.writes.push({ type: 'update', path: ref._path, data }),
      commit: async () => {
        for (const w of h.writes) {
          h.docStore.set(
            w.path,
            w.type === 'set'
              ? w.data
              : { ...(h.docStore.get(w.path) ?? {}), ...w.data }
          );
        }
      },
    }),
  };
  return { firestore: () => db };
});

import { commitProjectGroupsV1 } from './projectGroups';

const TEACHER = 'teacher-1';
const RUN_ID = `${TEACHER}_project-1`;
const RUN_PATH = `project_runs/${RUN_ID}`;

const call = (data: unknown, auth: unknown = { uid: TEACHER, token: {} }) =>
  (commitProjectGroupsV1 as unknown as (req: unknown) => Promise<any>)({
    data,
    auth,
  });

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
  h.hmacSecret = 'test-hmac-secret';
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

  it('moves membership on a re-import without touching tracked progress', async () => {
    h.docStore.set(`${RUN_PATH}/groups/g1`, {
      id: 'g1',
      name: 'Group 1',
      classId: 'class-a',
      memberUids: [expectedUid('SID-1')],
      order: 0,
      stepStates: { 'step-1': 'done', 'step-2': 'readyForReview' },
      needsSupport: true,
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
    expect(written?.data).not.toHaveProperty('needsSupport');
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
    expect(after.needsSupport).toBe(true);
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
