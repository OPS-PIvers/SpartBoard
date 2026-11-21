// Unit tests for the assignment-deletion pointer cleanup triggers (M17 §5 A2b).
//
// The regression this guards: assignment deletion is a client `writeBatch` that
// cannot touch `/student_assignments`, so without the trigger a deleted
// assignment keeps showing on every targeted student's `/my-assignments`.
// Pre-M17 assignments (no `targetStudents`) must remain a strict no-op.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: vi.fn((_opts: unknown, handler: unknown) => handler),
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// The cleanup module re-exports helpers from studentAssignmentTargets, which
// registers its own onCall — so every secret that module touches needs a stub.
vi.mock('./secrets', () => ({
  CLASSLINK_CLIENT_ID: { value: () => 'id' },
  CLASSLINK_CLIENT_SECRET: { value: () => 'secret' },
  CLASSLINK_TENANT_URL: { value: () => 'https://tenant.example' },
  STUDENT_PSEUDONYM_HMAC_SECRET: { value: () => 'unit-test-hmac-secret' },
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_opts: unknown, handler: unknown) => handler),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import * as admin from './firebaseAdmin';
import { computeStudentUid } from './classlinkShared';
import {
  cleanupMiniAppAssignmentPointers,
  cleanupQuizAssignmentPointers,
  deletePointersForAssignment,
  targetRefsFromAssignment,
} from './studentAssignmentCleanup';

const HMAC = 'unit-test-hmac-secret';
const ASSIGNMENT_ID = 'assignment-1';
const OWNER = 'teacher-a';

let deleted: string[];
let docs: Map<string, Record<string, unknown>>;

const pointerPath = (uid: string) =>
  `student_assignments/${uid}/items/${ASSIGNMENT_ID}`;
const uidOf = (sourcedId: string) => computeStudentUid(sourcedId, HMAC);
const ownedPointer = (
  uid: string,
  extra: Record<string, unknown> = {}
): void => {
  docs.set(pointerPath(uid), { teacherUid: OWNER, kind: 'quiz', ...extra });
};

function makeDb() {
  const docRef = (path: string) => ({
    __path: path,
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
    get: () => {
      const data = docs.get(path);
      return Promise.resolve({
        exists: data !== undefined,
        get: (field: string) => data?.[field],
      });
    },
  });
  const collectionRef = (path: string) => ({
    __path: path,
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  return {
    collection: (name: string) => collectionRef(name),
    recursiveDelete: (ref: { __path: string }) => {
      deleted.push(`${ref.__path}/*`);
      return Promise.resolve();
    },
    runTransaction: async <T>(
      fn: (tx: {
        get: (ref: { __path: string }) => Promise<unknown>;
        delete: (ref: { __path: string }) => void;
      }) => Promise<T>
    ): Promise<T> => {
      const ops: string[] = [];
      const result = await fn({
        get: (ref) => {
          const data = docs.get(ref.__path);
          return Promise.resolve({
            exists: data !== undefined,
            ref,
            get: (field: string) => data?.[field],
          });
        },
        delete: (ref) => {
          ops.push(ref.__path);
        },
      });
      deleted.push(...ops);
      return result;
    },
  };
}

beforeEach(() => {
  deleted = [];
  docs = new Map();
});

describe('targetRefsFromAssignment', () => {
  it('returns nothing for a pre-M17 assignment with no targetStudents', () => {
    expect(targetRefsFromAssignment({ id: ASSIGNMENT_ID })).toEqual([]);
    expect(targetRefsFromAssignment(undefined)).toEqual([]);
  });

  it('ignores a non-array targetStudents field', () => {
    expect(targetRefsFromAssignment({ targetStudents: 'nope' })).toEqual([]);
  });

  it('parses both ref kinds and lowercases test emails', () => {
    expect(
      targetRefsFromAssignment({
        targetStudents: [
          { kind: 'classlink', sourcedId: 'sid-1' },
          { kind: 'test', email: 'Kid@School.Edu' },
          { kind: 'bogus' },
          null,
        ],
      })
    ).toEqual([
      { kind: 'classlink', sourcedId: 'sid-1' },
      { kind: 'test', email: 'kid@school.edu' },
    ]);
  });
});

describe('deletePointersForAssignment', () => {
  const refs = [
    { kind: 'classlink' as const, sourcedId: 'sid-1' },
    { kind: 'test' as const, email: 'kid@school.edu' },
  ];
  const testUid = computeStudentUid('test:kid@school.edu', HMAC);

  it('deletes the pointer doc of every targeted student the owner fanned out', async () => {
    ownedPointer(uidOf('sid-1'));
    ownedPointer(testUid);
    const removed = await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      refs,
      HMAC,
      OWNER,
      'quiz'
    );
    expect(removed).toBe(2);
    expect(deleted).toEqual([
      pointerPath(uidOf('sid-1')),
      pointerPath(testUid),
    ]);
  });

  it("leaves another teacher's pointer alone when a forged target list names it", async () => {
    docs.set(pointerPath(uidOf('sid-1')), {
      teacherUid: 'teacher-b',
      kind: 'quiz',
    });
    ownedPointer(testUid);
    const removed = await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      refs,
      HMAC,
      OWNER,
      'quiz'
    );
    expect(removed).toBe(1);
    expect(deleted).toEqual([pointerPath(testUid)]);
  });

  it('deletes nothing when every pointer belongs to someone else', async () => {
    docs.set(pointerPath(uidOf('sid-1')), { teacherUid: 'teacher-b' });
    docs.set(pointerPath(testUid), { kind: 'quiz' });
    expect(
      await deletePointersForAssignment(
        makeDb() as never,
        ASSIGNMENT_ID,
        refs,
        HMAC,
        OWNER
      )
    ).toBe(0);
    expect(deleted).toEqual([]);
  });

  it('leaves a pointer of another assignment kind alone even for the same teacher', async () => {
    ownedPointer(uidOf('sid-1'), { kind: 'flashcards' });
    await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      [refs[0]],
      HMAC,
      OWNER,
      'quiz'
    );
    expect(deleted).toEqual([]);
  });

  it('writes nothing when the assignment had no targets (legacy path)', async () => {
    const removed = await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      [],
      HMAC,
      OWNER
    );
    expect(removed).toBe(0);
    expect(deleted).toEqual([]);
  });

  it('dedupes repeated refs into a single delete', async () => {
    ownedPointer(uidOf('sid-1'));
    await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      [
        { kind: 'classlink', sourcedId: 'sid-1' },
        { kind: 'classlink', sourcedId: 'sid-1' },
      ],
      HMAC,
      OWNER
    );
    expect(deleted).toHaveLength(1);
  });

  it('reaps a skipped student whose exclusion marker is the only pointer', async () => {
    const { pointerRefsFromAssignment } =
      await import('./studentAssignmentCleanup');
    ownedPointer(uidOf('sid-9'), { excluded: true });
    const skipped = pointerRefsFromAssignment({
      excludedTargets: [{ kind: 'classlink', sourcedId: 'sid-9' }],
    });
    await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      skipped,
      HMAC,
      OWNER
    );
    expect(deleted).toEqual([pointerPath(uidOf('sid-9'))]);
  });
});

describe('cleanupQuizAssignmentPointers', () => {
  type Handler = (event: {
    params: Record<string, string>;
    data?: { data: () => Record<string, unknown> };
  }) => Promise<void>;
  const run = (userId: string) =>
    (cleanupQuizAssignmentPointers as unknown as Handler)({
      params: { userId, assignmentId: ASSIGNMENT_ID },
      data: {
        data: () => ({
          targetStudents: [{ kind: 'classlink', sourcedId: 'victim' }],
        }),
      },
    });

  beforeEach(() => {
    (admin.firestore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeDb()
    );
  });

  it("does not touch another teacher's pointer when an attacker's same-id assignment lists the student", async () => {
    docs.set(pointerPath(uidOf('victim')), {
      teacherUid: 'teacher-victim',
      kind: 'quiz',
    });
    await run('attacker');
    expect(deleted).toEqual([]);
  });

  it('removes the pointers of the teacher whose assignment was deleted', async () => {
    docs.set(pointerPath(uidOf('victim')), { teacherUid: OWNER, kind: 'quiz' });
    await run(OWNER);
    expect(deleted).toEqual([pointerPath(uidOf('victim'))]);
  });
});

describe('cleanupMiniAppAssignmentPointers', () => {
  type Handler = (event: {
    params: Record<string, string>;
    data?: { data: () => Record<string, unknown> };
  }) => Promise<void>;
  const RECEIPTS = 'mini_app_sessions/session-1/receipts/*';
  const run = (userId: string, data: Record<string, unknown>) =>
    (cleanupMiniAppAssignmentPointers as unknown as Handler)({
      params: { userId, assignmentId: ASSIGNMENT_ID },
      data: { data: () => data },
    });

  beforeEach(() => {
    (admin.firestore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeDb()
    );
  });

  it("deletes the session's receipts with the owner's assignment, even with no targets", async () => {
    docs.set('mini_app_sessions/session-1', { teacherUid: OWNER });
    await run(OWNER, { sessionId: 'session-1' });
    expect(deleted).toEqual([RECEIPTS]);
  });

  it('deletes receipts and pointers together', async () => {
    docs.set('mini_app_sessions/session-1', { teacherUid: OWNER });
    docs.set(pointerPath(uidOf('sid-1')), {
      teacherUid: OWNER,
      kind: 'mini-app',
    });
    await run(OWNER, {
      sessionId: 'session-1',
      targetStudents: [{ kind: 'classlink', sourcedId: 'sid-1' }],
    });
    expect(deleted).toEqual([RECEIPTS, pointerPath(uidOf('sid-1'))]);
  });

  it('still deletes the pointers when the receipt sweep fails', async () => {
    const db = makeDb();
    db.recursiveDelete = () => Promise.reject(new Error('sweep failed'));
    (admin.firestore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      db
    );
    docs.set('mini_app_sessions/session-1', { teacherUid: OWNER });
    docs.set(pointerPath(uidOf('sid-1')), {
      teacherUid: OWNER,
      kind: 'mini-app',
    });
    await run(OWNER, {
      sessionId: 'session-1',
      targetStudents: [{ kind: 'classlink', sourcedId: 'sid-1' }],
    });
    expect(deleted).toEqual([pointerPath(uidOf('sid-1'))]);
  });

  it("leaves another teacher's session receipts alone", async () => {
    docs.set('mini_app_sessions/session-1', { teacherUid: 'teacher-b' });
    await run(OWNER, { sessionId: 'session-1' });
    expect(deleted).toEqual([]);
  });

  it('skips a missing session or a malformed session id', async () => {
    await run(OWNER, { sessionId: 'session-1' });
    await run(OWNER, { sessionId: 'a/b' });
    await run(OWNER, {});
    expect(deleted).toEqual([]);
  });
});
