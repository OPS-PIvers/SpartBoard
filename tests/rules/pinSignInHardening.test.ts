// Student sign-in hardening: who may create a quiz session, and what a
// pinLoginV1 token (studentRole + pinLogin, one class) may read.
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
import {
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  doc,
  query,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-pin-sign-in-hardening';
const TEACHER_UID = 'teacher-uid-psh';
const ANON_UID = 'anon-uid-psh';
const STUDENT_UID = 'student-uid-psh';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnon = (uid = ANON_UID) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();

const asSso = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      classIds: [CLASS_A, CLASS_B],
      sso: true,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asPin = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      classIds: [CLASS_A],
      pinLogin: true,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const session = (teacherUid: string) => ({
  teacherUid,
  code: 'ABC123',
  status: 'waiting',
  rosterIds: ['r1'],
});

const pointer = (classId: string) => ({
  kind: 'quiz',
  sessionId: 's1',
  teacherUid: TEACHER_UID,
  classId,
  createdAt: 1,
  updatedAt: 1,
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
    await setDoc(doc(db, 'quiz_sessions/existing'), session(TEACHER_UID));
    const items = `student_assignments/${STUDENT_UID}/items`;
    await setDoc(doc(db, `${items}/in-a`), pointer(CLASS_A));
    await setDoc(doc(db, `${items}/in-b`), pointer(CLASS_B));
    await setDoc(doc(db, `student_grades/${STUDENT_UID}/classes/${CLASS_A}`), {
      studentUid: STUDENT_UID,
      entries: {},
    });
  });
});

describe('quiz_sessions create', () => {
  it('lets a signed-in teacher create their own session', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), 'quiz_sessions/new'), session(TEACHER_UID))
    );
  });

  it('denies an anonymous visitor creating a session they own', async () => {
    await assertFails(
      setDoc(doc(asAnon(), 'quiz_sessions/new'), session(ANON_UID))
    );
  });

  it('keeps the owner update and every signed-in read working', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), 'quiz_sessions/existing'), {
        status: 'active',
      })
    );
    await assertSucceeds(getDoc(doc(asAnon(), 'quiz_sessions/existing')));
    await assertSucceeds(
      getDocs(
        query(
          collection(asAnon(), 'quiz_sessions'),
          where('code', '==', 'ABC123')
        )
      )
    );
    await assertSucceeds(getDoc(doc(asPin(), 'quiz_sessions/existing')));
  });
});

describe('PIN sign-in token scope', () => {
  const items = `student_assignments/${STUDENT_UID}/items`;
  const grades = `student_grades/${STUDENT_UID}/classes/${CLASS_A}`;

  it('reads its own pointer in its class and a missing pointer', async () => {
    await assertSucceeds(getDoc(doc(asPin(), `${items}/in-a`)));
    await assertSucceeds(getDoc(doc(asPin(), `${items}/missing`)));
    await assertSucceeds(
      getDocs(
        query(collection(asPin(), items), where('classId', '==', CLASS_A))
      )
    );
  });

  it("cannot read the same student's pointers in other classes", async () => {
    await assertFails(getDoc(doc(asPin(), `${items}/in-b`)));
    await assertFails(getDocs(collection(asPin(), items)));
  });

  it('cannot read grades', async () => {
    await assertFails(getDoc(doc(asPin(), grades)));
    await assertFails(
      getDocs(collection(asPin(), `student_grades/${STUDENT_UID}/classes`))
    );
  });

  it('leaves the SSO student reads unchanged', async () => {
    await assertSucceeds(getDoc(doc(asSso(), `${items}/in-b`)));
    await assertSucceeds(getDocs(collection(asSso(), items)));
    await assertSucceeds(getDoc(doc(asSso(), grades)));
  });

  it('never lets a PIN token write pointers or grades', async () => {
    await assertFails(setDoc(doc(asPin(), `${items}/in-a`), pointer(CLASS_A)));
    await assertFails(setDoc(doc(asPin(), grades), { entries: {} }));
  });
});
