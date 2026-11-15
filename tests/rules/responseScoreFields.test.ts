// Rules tests: score data on quiz, VA and GL responses. Students keep reading their own
// graded doc (every student app depends on it); classmates can't, and students can't write scores.
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

const PROJECT_ID = 'spartboard-response-score-fields';
const TEACHER_UID = 'teacher-uid-rsf';
const STUDENT_UID = 'student-uid-rsf';
const OTHER_UID = 'other-student-uid-rsf';
const PIN_KEY = 'pin-period_1-01';

const QUIZ_PATH = `quiz_sessions/quiz-rsf/responses/${PIN_KEY}`;
const VA_PATH = `video_activity_sessions/va-rsf/responses/${PIN_KEY}`;
const GL_PATH = `guided_learning_sessions/gl-rsf/responses/${STUDENT_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const anon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
const asStudent = () => anon(STUDENT_UID);
const asOther = () => anon(OTHER_UID);
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const gradedAnswers = [{ questionId: 'q1', answer: 'A', isCorrect: true }];

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
    // Unpublished: no scoreVisibility on any session.
    const session = {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
    };
    await setDoc(doc(db, 'quiz_sessions/quiz-rsf'), {
      ...session,
      code: 'RSFQZ1',
    });
    await setDoc(doc(db, 'video_activity_sessions/va-rsf'), session);
    await setDoc(doc(db, 'guided_learning_sessions/gl-rsf'), session);
    await setDoc(doc(db, QUIZ_PATH), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      status: 'completed',
      completedAttempts: 1,
      preSyncVersion: 0,
      tabSwitchWarnings: 0,
      score: 80,
      answers: gradedAnswers,
      grading: { q2: { points: 3, overallComment: 'Good start' } },
    });
    await setDoc(doc(db, VA_PATH), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      completedAt: 2000,
      completedAttempts: 1,
      tabSwitchWarnings: 0,
      score: 80,
      answers: gradedAnswers,
    });
    await setDoc(doc(db, GL_PATH), {
      studentAnonymousId: STUDENT_UID,
      sessionId: 'gl-rsf',
      startedAt: 1000,
      completedAt: 2000,
      score: 80,
      answers: gradedAnswers,
    });
  });
});

describe.each([
  ['quiz', QUIZ_PATH],
  ['video activity', VA_PATH],
  ['guided learning', GL_PATH],
])('%s response with score data, unpublished', (_label, path) => {
  it('owning student can still read it (join, resume and listeners need it)', async () => {
    await assertSucceeds(getDoc(doc(asStudent(), path)));
  });

  it('another student cannot read it', async () => {
    await assertFails(getDoc(doc(asOther(), path)));
  });

  it('teacher can read it', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), path)));
  });

  it('owning student cannot raise their own score', async () => {
    await assertFails(updateDoc(doc(asStudent(), path), { score: 100 }));
  });

  it('teacher can rewrite the score', async () => {
    await assertSucceeds(updateDoc(doc(asTeacher(), path), { score: 90 }));
  });
});

describe('quiz manual grades', () => {
  it('owning student cannot edit grading', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), QUIZ_PATH), {
        'grading.q2.points': 5,
      })
    );
  });

  it('teacher can edit grading', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), QUIZ_PATH), {
        'grading.q2.points': 4,
      })
    );
  });
});
