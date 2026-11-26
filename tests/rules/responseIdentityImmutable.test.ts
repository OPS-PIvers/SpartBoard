// Rules tests: a session owner grades quiz and VA responses but can't move one to another student or class; a quiz owner may fill in a missing class.
// Requires a running Firestore emulator (pnpm run test:rules).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-response-identity';
const TEACHER_UID = 'teacher-uid-rid';
const STUDENT_UID = 'student-uid-rid';
const VICTIM_UID = 'victim-uid-rid';

const QUIZ_PATH = `quiz_sessions/quiz-rid/responses/${STUDENT_UID}`;
const VA_PATH = `video_activity_sessions/va-rid/responses/${STUDENT_UID}`;

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

const asOtherTeacher = () =>
  testEnv
    .authenticatedContext('other-teacher-rid', {
      email: 'other@school.edu',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: host || '127.0.0.1',
      port: port ? Number(port) : 8080,
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
    const session = {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
      classIds: ['class-a'],
    };
    await setDoc(doc(db, 'quiz_sessions/quiz-rid'), {
      ...session,
      code: 'RIDQZ1',
    });
    await setDoc(doc(db, 'video_activity_sessions/va-rid'), session);
    const response = {
      studentUid: STUDENT_UID,
      classId: 'class-a',
      joinedAt: 1000,
      completedAttempts: 1,
      tabSwitchWarnings: 0,
      score: 80,
      answers: [],
    };
    await setDoc(doc(db, QUIZ_PATH), {
      ...response,
      status: 'completed',
      preSyncVersion: 0,
    });
    await setDoc(doc(db, VA_PATH), { ...response, completedAt: 2000 });
  });
});

describe.each([
  ['quiz', QUIZ_PATH],
  ['video activity', VA_PATH],
])('%s response identity, session owner', (_label, path) => {
  it('can still grade the response', async () => {
    await assertSucceeds(updateDoc(doc(asTeacher(), path), { score: 90 }));
  });

  it('cannot move the response to another student', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), path), { studentUid: VICTIM_UID })
    );
  });

  it('cannot move the response to another class', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), path), { classId: 'class-b' })
    );
  });

  it('cannot clear the class', async () => {
    await assertFails(updateDoc(doc(asTeacher(), path), { classId: null }));
  });
});

describe('quiz response with no class, session owner', () => {
  const NO_CLASS_PATH = `quiz_sessions/quiz-rid/responses/no-class-student`;
  const seedNoClass = async (classId: string | null) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), NO_CLASS_PATH), {
        studentUid: 'no-class-student',
        classId,
        joinedAt: 1000,
        completedAttempts: 0,
        tabSwitchWarnings: 0,
        answers: [],
      });
    });
  };

  it.each([[null], ['']])('can fill in a missing class (%j)', async (start) => {
    await seedNoClass(start);
    await assertSucceeds(
      updateDoc(doc(asTeacher(), NO_CLASS_PATH), { classId: 'class-a' })
    );
  });

  it('can still read the response', async () => {
    await seedNoClass(null);
    await assertSucceeds(getDoc(doc(asTeacher(), NO_CLASS_PATH)));
  });

  it('another teacher cannot fill in the class', async () => {
    await seedNoClass(null);
    await assertFails(
      updateDoc(doc(asOtherTeacher(), NO_CLASS_PATH), { classId: 'class-a' })
    );
    await assertFails(getDoc(doc(asOtherTeacher(), NO_CLASS_PATH)));
  });

  it('cannot fill in the class and move the student together', async () => {
    await seedNoClass(null);
    await assertFails(
      updateDoc(doc(asTeacher(), NO_CLASS_PATH), {
        classId: 'class-a',
        studentUid: VICTIM_UID,
      })
    );
  });
});

describe('video activity response with no class, session owner', () => {
  it('cannot fill in the class', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), VA_PATH), {
        studentUid: STUDENT_UID,
        classId: null,
        joinedAt: 1000,
        answers: [],
      });
    });
    await assertFails(
      updateDoc(doc(asTeacher(), VA_PATH), { classId: 'class-a' })
    );
  });
});
