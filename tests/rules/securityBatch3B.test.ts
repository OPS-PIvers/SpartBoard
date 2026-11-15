// Video Activity responses: answers keep their order and the server's answer record stays server-only.
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
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-security-batch-3b';
const TEACHER_UID = 'teacher-uid-3b';
const STUDENT_UID = 'student-uid-3b';
const OTHER_UID = 'other-uid-3b';
const SESSION_ID = 'va-session-3b';
const SESSION_PATH = `video_activity_sessions/${SESSION_ID}`;
const RESPONSE_PATH = `${SESSION_PATH}/responses/pin-period_1-01`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const anon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
const asStudent = () => anon(STUDENT_UID);
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@example.org',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const Q1 = { questionId: 'q1', answer: 'Rome', answeredAt: 1000 };
const Q2 = { questionId: 'q2', answer: 'blue', answeredAt: 2000 };

const seedResponse = (extra: Record<string, unknown> = {}) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), RESPONSE_PATH), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [Q1, Q2],
      checkedAnswers: {
        q1: { answer: 'Rome', attempt: 0 },
        q2: { answer: 'blue', attempt: 0 },
      },
      completedAt: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
      ...extra,
    });
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
    await setDoc(doc(ctx.firestore(), SESSION_PATH), {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
    });
  });
  await seedResponse();
});

describe('VA response answers keep their order', () => {
  it('lets a student append an answer', async () => {
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: arrayUnion({ questionId: 'q3', answer: 'x', answeredAt: 3 }),
      })
    );
  });

  it('refuses an entry put ahead of the recorded ones', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ questionId: 'q1', answer: 'Paris', answeredAt: 1 }, Q1, Q2],
      })
    );
  });

  it('refuses reordering the recorded answers', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), { answers: [Q2, Q1] })
    );
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [Q1, { questionId: 'q1', answer: 'Paris', answeredAt: 1 }, Q2],
      })
    );
  });

  it('still lets a finished student reset answers for a retake', async () => {
    await seedResponse({ completedAt: 5000, completedAttempts: 1 });
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        completedAt: null,
        answers: [],
      })
    );
  });

  it('still lets a student finish', async () => {
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        completedAt: Date.now(),
        completedAttempts: 1,
      })
    );
  });
});

describe('VA server answer record', () => {
  it('refuses a student write to it', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        checkedAnswers: { q1: { answer: 'Paris', attempt: 0 } },
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        'checkedAnswers.q3': { answer: 'x', attempt: 0 },
      })
    );
  });

  it('refuses a join that brings one', async () => {
    const path = `${SESSION_PATH}/responses/pin-period_1-02`;
    const join = {
      studentUid: OTHER_UID,
      pin: '02',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAt: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
    };
    await assertFails(
      setDoc(doc(anon(OTHER_UID), path), {
        ...join,
        checkedAnswers: { q1: { answer: 'Paris', attempt: 0 } },
      })
    );
    await assertSucceeds(setDoc(doc(anon(OTHER_UID), path), join));
  });

  it('lets the teacher still publish scores and the student still read', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), RESPONSE_PATH), {
        score: 50,
        answers: [
          { ...Q1, isCorrect: false },
          { ...Q2, isCorrect: true },
        ],
      })
    );
    await assertSucceeds(getDoc(doc(asStudent(), RESPONSE_PATH)));
    await assertFails(getDoc(doc(anon(OTHER_UID), RESPONSE_PATH)));
  });
});
