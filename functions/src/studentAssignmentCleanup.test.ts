// Unit tests for the assignment-deletion pointer cleanup triggers (M17 §5 A2b).
//
// The regression this guards: assignment deletion is a client `writeBatch` that
// cannot touch `/student_assignments`, so without the trigger a deleted
// assignment keeps showing on every targeted student's `/my-assignments`.
// Pre-M17 assignments (no `targetStudents`) must remain a strict no-op.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
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

import { computeStudentUid } from './classlinkShared';
import {
  deletePointersForAssignment,
  targetRefsFromAssignment,
} from './studentAssignmentCleanup';

const HMAC = 'unit-test-hmac-secret';
const ASSIGNMENT_ID = 'assignment-1';

let deleted: string[];

function makeDb() {
  const docRef = (path: string) => ({
    __path: path,
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  return {
    collection: (name: string) => collectionRef(name),
    batch: () => {
      const ops: string[] = [];
      return {
        delete: (ref: { __path: string }) => {
          ops.push(ref.__path);
        },
        commit: () => {
          deleted.push(...ops);
          return Promise.resolve();
        },
      };
    },
  };
}

beforeEach(() => {
  deleted = [];
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
  it('deletes exactly the pointer doc of every targeted student', async () => {
    const removed = await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      [
        { kind: 'classlink', sourcedId: 'sid-1' },
        { kind: 'test', email: 'kid@school.edu' },
      ],
      HMAC
    );
    expect(removed).toBe(2);
    expect(deleted).toEqual([
      `student_assignments/${computeStudentUid('sid-1', HMAC)}/items/${ASSIGNMENT_ID}`,
      `student_assignments/${computeStudentUid('test:kid@school.edu', HMAC)}/items/${ASSIGNMENT_ID}`,
    ]);
  });

  it('writes nothing when the assignment had no targets (legacy path)', async () => {
    const removed = await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      [],
      HMAC
    );
    expect(removed).toBe(0);
    expect(deleted).toEqual([]);
  });

  it('dedupes repeated refs into a single delete', async () => {
    await deletePointersForAssignment(
      makeDb() as never,
      ASSIGNMENT_ID,
      [
        { kind: 'classlink', sourcedId: 'sid-1' },
        { kind: 'classlink', sourcedId: 'sid-1' },
      ],
      HMAC
    );
    expect(deleted).toHaveLength(1);
  });
});
