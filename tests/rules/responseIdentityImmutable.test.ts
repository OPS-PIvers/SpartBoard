// Rules tests: a session owner grades quiz and VA responses but can't move one to another student or class (the gradebook keys on both).
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
import { doc, setDoc, updateDoc } from 'firebase/firestore';

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
