// VA response rules: live runs take answers only through the check callable, and a
// self-paced append can't duplicate a server-recorded question or carry takeIndex.
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
import { setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-va-answer-append';
const TEACHER_UID = 'teacher-uid-vaa';
const STUDENT_UID = 'student-uid-vaa';
const SESSION_ID = 'va-session-vaa';
const RESPONSE_PATH = `video_activity_sessions/${SESSION_ID}/responses/pin-period_1-01`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const recordedQ1 = {
  questionId: 'q1',
  answer: 'wrong',
  answeredAt: 5000,
};

async function seed(
  session: Record<string, unknown>,
  response: Record<string, unknown>
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `video_activity_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
      ...session,
    });
    await setDoc(doc(db, RESPONSE_PATH), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAt: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
      ...response,
    });
  });
}

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
});

describe('VA response student appends', () => {
  it('denies a duplicate entry for a server-recorded question (answeredAt 0)', async () => {
    await seed(
      {},
      {
        answers: [recordedQ1],
        checkedAnswers: { q1: { answer: 'wrong', attempt: 0 } },
      }
    );
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [
          recordedQ1,
          { questionId: 'q1', answer: 'right', answeredAt: 0 },
        ],
      })
    );
  });

  it('allows a first answer for a new question', async () => {
    await seed(
      {},
      {
        answers: [recordedQ1],
        checkedAnswers: { q1: { answer: 'wrong', attempt: 0 } },
      }
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [
          recordedQ1,
          { questionId: 'q2', answer: 'b', answeredAt: 6000 },
        ],
      })
    );
  });

  it('allows re-answering a question recorded in an earlier attempt', async () => {
    await seed(
      {},
      {
        answers: [],
        completedAttempts: 1,
        checkedAnswers: { q1: { answer: 'wrong', attempt: 0 } },
      }
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ questionId: 'q1', answer: 'right', answeredAt: 6000 }],
      })
    );
  });

  it('denies an entry carrying takeIndex', async () => {
    await seed({}, {});
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [
          { questionId: 'q1', answer: 'a', answeredAt: 6000, takeIndex: 9 },
        ],
      })
    );
  });

  it('denies appending two entries in one write', async () => {
    await seed({}, {});
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [
          { questionId: 'q1', answer: 'a', answeredAt: 6000 },
          { questionId: 'q2', answer: 'b', answeredAt: 6000 },
        ],
      })
    );
  });

  it('denies a live-run append after the board revealed the key', async () => {
    await seed(
      {
        sessionMode: 'teacher',
        live: {
          currentQuestionId: 'q2',
          questionPhase: 'closed',
          answerRevealed: true,
          revealedAnswer: 'b',
        },
      },
      {}
    );
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ questionId: 'q2', answer: 'b', answeredAt: 6000 }],
      })
    );
  });

  it('still lets a live-run student finish', async () => {
    await seed(
      { sessionMode: 'teacher', live: { questionPhase: 'closed' } },
      { answers: [recordedQ1] }
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        completedAt: Date.now(),
        completedAttempts: 1,
      })
    );
  });
});
