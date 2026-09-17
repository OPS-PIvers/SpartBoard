// Firestore security-rules tests for paper answer sheets:
//   - /users/{uid}/paper_batches/{batchId} — owner-only CRUD, cross-teacher
//     denial, studentRole denial, anonymous/unauth denial.
//   - /admin_settings/paper_answer_sheets — any authed user reads the rollout
//     switch; only an admin flips it.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-paper-batches-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_TEACHER_UID = 'teacher-uid-2';
const ADMIN_UID = 'admin-uid-1';
const ADMIN_EMAIL = 'admin@school.edu';
const STUDENT_UID = 'student-uid-1';
const ANON_UID = 'anon-pin-uid';
const BATCH_ID = 'batch-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asOtherTeacher = () =>
  testEnv
    .authenticatedContext(OTHER_TEACHER_UID, {
      email: 'other.teacher@school.edu',
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudentRole = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const batchPath = (uid = TEACHER_UID) =>
  `users/${uid}/paper_batches/${BATCH_ID}`;
const settingsPath = 'admin_settings/paper_answer_sheets';

const batchFields = () => ({
  id: BATCH_ID,
  quizId: 'quiz-1',
  rosterIds: ['roster-1'],
  questionCount: 25,
  choiceCount: 4,
  seats: {
    1: { rosterId: 'roster-1', studentId: 'student-a' },
    2: { rosterId: 'roster-1', studentId: 'student-b' },
  },
  spareSeats: [3],
  keySheetSeat: 4,
  pagesPerSheet: 1,
  createdAt: 1000,
});

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), batchPath()), batchFields());
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
      role: 'admin',
    });
    await setDoc(doc(ctx.firestore(), settingsPath), { enabled: false });
  });
});

describe('/users/{uid}/paper_batches — owner access', () => {
  it('lets the owner read, create, update and delete a batch', async () => {
    const db = asTeacher();
    await assertSucceeds(getDoc(doc(db, batchPath())));
    await assertSucceeds(
      setDoc(doc(db, `users/${TEACHER_UID}/paper_batches/batch-2`), {
        ...batchFields(),
        id: 'batch-2',
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, batchPath()), { spareSeats: [3, 4] })
    );
    await assertSucceeds(deleteDoc(doc(db, batchPath())));
  });
});

describe('/users/{uid}/paper_batches — denials', () => {
  it('denies another teacher', async () => {
    const db = asOtherTeacher();
    await assertFails(getDoc(doc(db, batchPath())));
    await assertFails(updateDoc(doc(db, batchPath()), { choiceCount: 5 }));
    await assertFails(deleteDoc(doc(db, batchPath())));
  });

  it('denies a studentRole user, including in their own namespace', async () => {
    const db = asStudentRole();
    await assertFails(getDoc(doc(db, batchPath())));
    await assertFails(setDoc(doc(db, batchPath(STUDENT_UID)), batchFields()));
  });

  it('denies an anonymous PIN joiner', async () => {
    const db = asAnonStudent();
    await assertFails(getDoc(doc(db, batchPath())));
    await assertFails(setDoc(doc(db, batchPath(ANON_UID)), batchFields()));
  });

  it('denies an unauthenticated client', async () => {
    const db = asUnauth();
    await assertFails(getDoc(doc(db, batchPath())));
    await assertFails(updateDoc(doc(db, batchPath()), { choiceCount: 5 }));
  });
});

describe('/admin_settings/paper_answer_sheets — rollout switch', () => {
  it('lets any authed teacher read the switch', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), settingsPath)));
  });

  it('denies an unauthenticated read', async () => {
    await assertFails(getDoc(doc(asUnauth(), settingsPath)));
  });

  it('denies a non-admin write and allows an admin write', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), settingsPath), { enabled: true })
    );
    await assertSucceeds(
      setDoc(doc(asAdmin(), settingsPath), { enabled: true })
    );
  });
});
