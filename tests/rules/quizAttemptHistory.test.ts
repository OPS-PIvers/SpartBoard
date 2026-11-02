// Firestore security-rules tests for quiz attempt history (docs/plans/shipped/QUIZ_ATTEMPT_HISTORY.md).
// Requires a running Firestore emulator; invoke via `pnpm run test:rules`.
//
// Contract: attempt copies and attempt scores are server-written. The session
// teacher, admins and the session's sub monitor read them; the student who made
// the attempts, other teachers and other students read nothing. The only client
// write is the session teacher or an admin grading an earlier (closed) attempt's copy.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-attempt-history-test';
const TEACHER_UID = 'teacher-attempts';
const OTHER_TEACHER_UID = 'other-teacher-attempts';
const SUB_UID = 'sub-attempts';
const STUDENT_UID = 'student-attempts';
const OTHER_STUDENT_UID = 'other-student-attempts';
const ADMIN_EMAIL = 'admin-attempts@orono.k12.mn.us';
const SESSION = 'session-attempts';
const EXPIRED = 'session-attempts-expired';
const FUTURE = 4_000_000_000_000;
const PAST = 1_000_000_000_000;

const ATTEMPT = `quiz_sessions/${SESSION}/responses/${STUDENT_UID}/attempts/1`;
const SCORES = `quiz_sessions/${SESSION}/attemptScores/${STUDENT_UID}`;
const CLOSED = `quiz_sessions/${SESSION}/responses/${STUDENT_UID}/attempts/2`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const staff = (uid: string, email = `${uid}@orono.k12.mn.us`) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const student = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
      studentRole: true,
      classIds: [],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const anonStudent = () =>
  testEnv
    .authenticatedContext('anon-attempts', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

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

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { email: ADMIN_EMAIL });
    await setDoc(doc(db, `quiz_sessions/${SESSION}`), {
      id: SESSION,
      teacherUid: TEACHER_UID,
      status: 'active',
      classIds: [],
      quizId: 'q1',
      subMonitorUids: [SUB_UID],
      subMonitorUntil: FUTURE,
    });
    await setDoc(doc(db, `quiz_sessions/${EXPIRED}`), {
      id: EXPIRED,
      teacherUid: TEACHER_UID,
      status: 'active',
      classIds: [],
      quizId: 'q1',
      subMonitorUids: [SUB_UID],
      subMonitorUntil: PAST,
    });
    await setDoc(
      doc(db, `quiz_sessions/${EXPIRED}/responses/${STUDENT_UID}/attempts/1`),
      { n: 1, studentUid: STUDENT_UID, answers: [] }
    );
    await setDoc(
      doc(db, `quiz_sessions/${EXPIRED}/attemptScores/${STUDENT_UID}`),
      { studentUid: STUDENT_UID, attempts: [] }
    );
    await setDoc(doc(db, `quiz_sessions/${SESSION}/responses/${STUDENT_UID}`), {
      studentUid: STUDENT_UID,
      status: 'joined',
      answers: [],
      score: null,
      completedAttempts: 1,
    });
    await setDoc(doc(db, ATTEMPT), {
      n: 1,
      studentUid: STUDENT_UID,
      answers: [{ questionId: 'q1', answer: 'A' }],
    });
    await setDoc(doc(db, CLOSED), {
      n: 2,
      closed: true,
      studentUid: STUDENT_UID,
      answers: [{ questionId: 'q1', answer: 'B' }],
      grading: {},
    });
    await setDoc(doc(db, SCORES), {
      studentUid: STUDENT_UID,
      attempts: [{ n: 1, at: 1, points: 2, max: 2, state: 'scored' }],
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('quiz attempt copies', () => {
  it('lets the session teacher, an admin and the sub monitor read them', async () => {
    await assertSucceeds(getDoc(doc(staff(TEACHER_UID), ATTEMPT)));
    await assertSucceeds(getDoc(doc(staff('admin-uid', ADMIN_EMAIL), ATTEMPT)));
    await assertSucceeds(getDoc(doc(staff(SUB_UID), ATTEMPT)));
    await assertSucceeds(
      getDocs(
        collection(
          staff(TEACHER_UID),
          `quiz_sessions/${SESSION}/responses/${STUDENT_UID}/attempts`
        )
      )
    );
  });

  it('hides them from a sub monitor whose share has expired', async () => {
    await assertFails(
      getDoc(
        doc(
          staff(SUB_UID),
          `quiz_sessions/${EXPIRED}/responses/${STUDENT_UID}/attempts/1`
        )
      )
    );
    await assertFails(
      getDoc(
        doc(
          staff(SUB_UID),
          `quiz_sessions/${EXPIRED}/attemptScores/${STUDENT_UID}`
        )
      )
    );
  });

  it('hides them from the student, other students and other teachers', async () => {
    await assertFails(getDoc(doc(student(STUDENT_UID), ATTEMPT)));
    await assertFails(getDoc(doc(student(OTHER_STUDENT_UID), ATTEMPT)));
    await assertFails(getDoc(doc(anonStudent(), ATTEMPT)));
    await assertFails(getDoc(doc(staff(OTHER_TEACHER_UID), ATTEMPT)));
  });

  it('refuses every other client write, the teacher included', async () => {
    const forged = { n: 3, studentUid: STUDENT_UID, answers: [] };
    const second = `quiz_sessions/${SESSION}/responses/${STUDENT_UID}/attempts/3`;
    await assertFails(setDoc(doc(student(STUDENT_UID), second), forged));
    await assertFails(setDoc(doc(staff(TEACHER_UID), second), forged));
    await assertFails(updateDoc(doc(staff(TEACHER_UID), ATTEMPT), { n: 3 }));
    await assertFails(deleteDoc(doc(staff(TEACHER_UID), ATTEMPT)));
    await assertFails(deleteDoc(doc(staff('admin-uid', ADMIN_EMAIL), ATTEMPT)));
  });

  it('lets only the session teacher or an admin grade an earlier attempt', async () => {
    const grade = { 'grading.q1': { points: 1 } };
    await assertSucceeds(updateDoc(doc(staff(TEACHER_UID), CLOSED), grade));
    await assertSucceeds(
      updateDoc(doc(staff('admin-uid', ADMIN_EMAIL), CLOSED), {
        'grading.q1': { points: 0 },
      })
    );
    await assertFails(updateDoc(doc(staff(TEACHER_UID), ATTEMPT), grade));
    await assertFails(
      updateDoc(doc(staff(TEACHER_UID), CLOSED), {
        answers: [{ questionId: 'q1', answer: 'A' }],
      })
    );
    await assertFails(
      updateDoc(doc(staff(TEACHER_UID), CLOSED), { closed: false })
    );
    await assertFails(updateDoc(doc(staff(SUB_UID), CLOSED), grade));
    await assertFails(updateDoc(doc(staff(OTHER_TEACHER_UID), CLOSED), grade));
    await assertFails(updateDoc(doc(student(STUDENT_UID), CLOSED), grade));
  });
});

describe('quiz attempt scores', () => {
  it('lets the session teacher, an admin and the sub monitor read them', async () => {
    await assertSucceeds(getDoc(doc(staff(TEACHER_UID), SCORES)));
    await assertSucceeds(getDoc(doc(staff('admin-uid', ADMIN_EMAIL), SCORES)));
    await assertSucceeds(getDoc(doc(staff(SUB_UID), SCORES)));
    await assertSucceeds(
      getDocs(
        collection(staff(TEACHER_UID), `quiz_sessions/${SESSION}/attemptScores`)
      )
    );
  });

  it('hides them from students, since results may not be released', async () => {
    await assertFails(getDoc(doc(student(STUDENT_UID), SCORES)));
    await assertFails(getDoc(doc(anonStudent(), SCORES)));
    await assertFails(
      getDocs(
        collection(
          student(STUDENT_UID),
          `quiz_sessions/${SESSION}/attemptScores`
        )
      )
    );
    await assertFails(getDoc(doc(staff(OTHER_TEACHER_UID), SCORES)));
  });

  it('refuses every client write', async () => {
    const forged = {
      studentUid: STUDENT_UID,
      attempts: [{ n: 1, at: 1, points: 2, max: 2, state: 'scored' }],
    };
    await assertFails(setDoc(doc(student(STUDENT_UID), SCORES), forged));
    await assertFails(setDoc(doc(staff(TEACHER_UID), SCORES), forged));
    await assertFails(deleteDoc(doc(staff(TEACHER_UID), SCORES)));
  });
});
