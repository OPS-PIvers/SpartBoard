// Firestore security-rules tests for `/student_assignments/{studentUid}/items`
// (M17 §5 A3). Requires a running Firestore emulator; invoke via
// `pnpm run test:rules`.
//
// Contract: the pointer collection is the per-student fan-out written
// EXCLUSIVELY by setAssignmentTargetsV1 / the assignment-deletion triggers
// (Admin SDK). Reads (get AND list) are gated purely on the {studentUid} path
// segment plus the studentRole claim, so a student's own listener works and
// nobody — student, teacher, or admin — can enumerate another student's items.
// No client write path exists at all.
//
// Also pins the recorded non-goal: `collectionGroup('items')` must stay denied,
// because a cross-assignment per-student view is exactly what the pseudonym
// design exists to prevent.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  collection,
  collectionGroup,
  doc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-student-pointers-test';
const STUDENT_A_UID = 'student-a-uid';
const STUDENT_B_UID = 'student-b-uid';
const TEACHER_UID = 'teacher-uid-1';
const ADMIN_EMAIL = 'admin@example.com';
const ASSIGNMENT_ID = 'assignment-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = (uid: string, classIds: string[] = ['class-A']) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: true,
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

// A non-studentRole custom-token holder whose uid happens to equal the pointer
// path segment — proves the studentRole claim is load-bearing, not decorative.
const asNonStudentWithStudentUid = () =>
  testEnv
    .authenticatedContext(STUDENT_A_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const itemPath = (uid: string, assignmentId = ASSIGNMENT_ID) =>
  `student_assignments/${uid}/items/${assignmentId}`;

const pointer = () => ({
  kind: 'quiz',
  sessionId: ASSIGNMENT_ID,
  teacherUid: TEACHER_UID,
  classId: 'class-A',
  createdAt: 1000,
  updatedAt: 1000,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(
        process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? '8080'
      ),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { email: ADMIN_EMAIL });
    await setDoc(doc(db, itemPath(STUDENT_A_UID)), pointer());
    await setDoc(doc(db, itemPath(STUDENT_A_UID, 'assignment-2')), pointer());
    await setDoc(doc(db, itemPath(STUDENT_B_UID)), pointer());
  });
});

describe('student_assignments — self-read only', () => {
  it('student can get their own pointer doc', async () => {
    await assertSucceeds(
      getDoc(doc(asStudent(STUDENT_A_UID), itemPath(STUDENT_A_UID)))
    );
  });

  it('student can list their own items collection', async () => {
    await assertSucceeds(
      getDocs(
        collection(
          asStudent(STUDENT_A_UID),
          `student_assignments/${STUDENT_A_UID}/items`
        )
      )
    );
  });

  it("student cannot get another student's pointer doc", async () => {
    await assertFails(
      getDoc(doc(asStudent(STUDENT_A_UID), itemPath(STUDENT_B_UID)))
    );
  });

  it("student cannot list another student's items collection", async () => {
    await assertFails(
      getDocs(
        collection(
          asStudent(STUDENT_A_UID),
          `student_assignments/${STUDENT_B_UID}/items`
        )
      )
    );
  });

  it('teacher cannot read a student pointer doc', async () => {
    await assertFails(getDoc(doc(asTeacher(), itemPath(STUDENT_A_UID))));
  });

  it('admin cannot read a student pointer doc', async () => {
    await assertFails(getDoc(doc(asAdmin(), itemPath(STUDENT_A_UID))));
  });

  it('a caller without the studentRole claim cannot read even a matching uid path', async () => {
    await assertFails(
      getDoc(doc(asNonStudentWithStudentUid(), itemPath(STUDENT_A_UID)))
    );
  });

  it('unauthenticated caller cannot read', async () => {
    await assertFails(getDoc(doc(asUnauth(), itemPath(STUDENT_A_UID))));
  });

  it('the parent student_assignments doc is not readable', async () => {
    await assertFails(
      getDoc(
        doc(asStudent(STUDENT_A_UID), `student_assignments/${STUDENT_A_UID}`)
      )
    );
  });
});

// Recorded non-goal: nothing may read /student_assignments grouped per-student
// across assignments. No wildcard rule matches the `items` collection group, so
// the query is denied for every caller.
describe('student_assignments — collectionGroup access is denied', () => {
  it('student cannot run collectionGroup("items")', async () => {
    await assertFails(
      getDocs(collectionGroup(asStudent(STUDENT_A_UID), 'items'))
    );
  });

  it('teacher cannot run collectionGroup("items")', async () => {
    await assertFails(getDocs(collectionGroup(asTeacher(), 'items')));
  });

  it('admin cannot run collectionGroup("items")', async () => {
    await assertFails(getDocs(collectionGroup(asAdmin(), 'items')));
  });
});

describe('student_assignments — no client write path', () => {
  it('student cannot create their own pointer doc', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(STUDENT_A_UID), itemPath(STUDENT_A_UID, 'forged')),
        pointer()
      )
    );
  });

  it('student cannot update their own pointer doc (e.g. widen their window)', async () => {
    await assertFails(
      updateDoc(doc(asStudent(STUDENT_A_UID), itemPath(STUDENT_A_UID)), {
        closeAt: 9_999_999_999_999,
      })
    );
  });

  it('student cannot delete their own pointer doc', async () => {
    await assertFails(
      deleteDoc(doc(asStudent(STUDENT_A_UID), itemPath(STUDENT_A_UID)))
    );
  });

  it("student cannot write into another student's items", async () => {
    await assertFails(
      setDoc(
        doc(asStudent(STUDENT_A_UID), itemPath(STUDENT_B_UID, 'forged')),
        pointer()
      )
    );
  });

  it('teacher cannot write a pointer doc directly', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), itemPath(STUDENT_A_UID, 'forged')), pointer())
    );
  });

  it('admin cannot write a pointer doc directly', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), itemPath(STUDENT_A_UID, 'forged')), pointer())
    );
  });
});
