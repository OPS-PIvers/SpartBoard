// Rules for the attempt count, the timed-attempt clock and the server turn-in stamp on quiz and video responses.
// Requires a running Firestore emulator: pnpm run test:rules

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
  Timestamp,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-response-integrity';
const TEACHER_UID = 'teacher-integrity';
const STUDENT_UID = 'student-integrity';
const CLASS_ID = 'class-integrity';
const QUIZ = 'quiz_sessions/quiz-integrity';
const QUIZ_RESPONSE = `${QUIZ}/responses/${STUDENT_UID}`;
const VA = 'video_activity_sessions/va-integrity';
const VA_RESPONSE = `${VA}/responses/${STUDENT_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: `${STUDENT_UID}@school.edu`,
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 't@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

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

const seed = async (path: string, data: Record<string, unknown> | null) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    if (data) await setDoc(doc(ctx.firestore(), path), data);
  });
};

const quizSession = (extra: Record<string, unknown> = {}) => ({
  teacherUid: TEACHER_UID,
  status: 'active',
  code: 'INTEG1',
  sessionMode: 'student',
  classId: CLASS_ID,
  classIds: [CLASS_ID],
  ...extra,
});
const quizResponse = (extra: Record<string, unknown> = {}) => ({
  studentUid: STUDENT_UID,
  joinedAt: 1000,
  score: null,
  answers: [],
  status: 'in-progress',
  submittedAt: null,
  completedAttempts: 0,
  preSyncVersion: 0,
  ...extra,
});
const answer = {
  questionId: 'q1',
  answer: 'A',
  answeredAt: 1,
  status: 'draft',
};

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('quiz completedAttempts', () => {
  beforeEach(async () => {
    await seed(QUIZ, quizSession());
  });

  it('a normal turn-in raises it by one', async () => {
    await seed(QUIZ_RESPONSE, quizResponse());
    await assertSucceeds(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        status: 'completed',
        submittedAt: Date.now(),
        completedAttempts: increment(1),
      })
    );
  });

  it('raising it alone on a completed response is denied', async () => {
    await seed(
      QUIZ_RESPONSE,
      quizResponse({
        status: 'completed',
        submittedAt: Date.now() - 60_000,
        completedAttempts: 1,
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        completedAttempts: increment(1),
      })
    );
  });

  it('raising it mid-attempt without turning in is denied', async () => {
    await seed(QUIZ_RESPONSE, quizResponse());
    await assertFails(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), { completedAttempts: 1 })
    );
  });

  it('a retake keeps the count', async () => {
    await seed(
      QUIZ_RESPONSE,
      quizResponse({
        status: 'completed',
        submittedAt: Date.now() - 60_000,
        completedAttempts: 1,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        status: 'joined',
        answers: [],
        score: null,
        submittedAt: null,
        preSyncVersion: 0,
        lastWriteAt: serverTimestamp(),
      })
    );
  });
});

describe('video activity completedAttempts', () => {
  beforeEach(async () => {
    await seed(VA, {
      teacherUid: TEACHER_UID,
      activityId: 'act-1',
      status: 'active',
      mode: 'submissions',
      classIds: [CLASS_ID],
    });
  });
  const vaResponse = (extra: Record<string, unknown> = {}) => ({
    studentUid: STUDENT_UID,
    joinedAt: 1,
    answers: [{ questionId: 'q1', answer: 'A', answeredAt: 2 }],
    completedAt: null,
    score: null,
    completedAttempts: 0,
    tabSwitchWarnings: 0,
    ...extra,
  });

  it('completion raises it by one', async () => {
    await seed(VA_RESPONSE, vaResponse());
    await assertSucceeds(
      updateDoc(doc(asStudent(), VA_RESPONSE), {
        completedAt: Date.now(),
        completedAttempts: increment(1),
      })
    );
  });

  it('raising it alone on a completed response is denied', async () => {
    await seed(
      VA_RESPONSE,
      vaResponse({ completedAt: Date.now() - 60_000, completedAttempts: 1 })
    );
    await assertFails(
      updateDoc(doc(asStudent(), VA_RESPONSE), {
        completedAttempts: increment(1),
      })
    );
  });

  it('changing it during a retake reset is denied', async () => {
    await seed(
      VA_RESPONSE,
      vaResponse({ completedAt: Date.now() - 60_000, completedAttempts: 1 })
    );
    await assertFails(
      updateDoc(doc(asStudent(), VA_RESPONSE), {
        completedAt: null,
        answers: [],
        completedAttempts: 0,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), VA_RESPONSE), {
        completedAt: null,
        answers: [],
      })
    );
  });

  it('a student cannot write the server turn-in stamp', async () => {
    await seed(VA_RESPONSE, vaResponse());
    await assertFails(
      updateDoc(doc(asStudent(), VA_RESPONSE), {
        completedAt: Date.now(),
        completedAttempts: increment(1),
        turnIn: { at: 1, claimed: 1 },
      })
    );
  });
});

describe('quiz timed-attempt clock', () => {
  it('answers without a server-stamped start are denied on a timed self-paced session', async () => {
    await seed(QUIZ, quizSession({ timeLimitMinutes: 10 }));
    await seed(QUIZ_RESPONSE, quizResponse());
    await assertFails(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), { answers: [answer] })
    );
  });

  it('stamping the clock lets answers through', async () => {
    await seed(QUIZ, quizSession({ timeLimitMinutes: 10 }));
    await seed(QUIZ_RESPONSE, quizResponse());
    await assertSucceeds(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        attemptStartedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), { answers: [answer] })
    );
  });

  it('a timed join with answers but no clock is denied', async () => {
    await seed(QUIZ, quizSession({ timeLimitMinutes: 10 }));
    const join = {
      ...quizResponse({ status: 'joined', answers: [answer] }),
      lastWriteAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(asStudent(), QUIZ_RESPONSE), join));
    await assertSucceeds(
      setDoc(doc(asStudent(), QUIZ_RESPONSE), {
        ...join,
        answers: [],
        attemptStartedAt: serverTimestamp(),
      })
    );
  });

  it('a timed self-paced join without the clock is denied', async () => {
    await seed(QUIZ, quizSession({ timeLimitMinutes: 10 }));
    await assertFails(
      setDoc(doc(asStudent(), QUIZ_RESPONSE), {
        ...quizResponse({ status: 'joined' }),
        lastWriteAt: serverTimestamp(),
      })
    );
  });

  it('rewriting submittedAt on a completed response is denied', async () => {
    await seed(QUIZ, quizSession());
    await seed(
      QUIZ_RESPONSE,
      quizResponse({
        status: 'completed',
        submittedAt: Date.now() - 1000,
        completedAttempts: 1,
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        submittedAt: Date.now() - 60_000,
      })
    );
  });

  it('emptying the open attempt input signals is denied', async () => {
    await seed(QUIZ, quizSession({ inputSignals: true }));
    await seed(
      QUIZ_RESPONSE,
      quizResponse({ inputSignals: { '0': { q1: { paste: 2 } } } })
    );
    await assertFails(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), { 'inputSignals.0': {} })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        'inputSignals.0': { q1: { paste: 3 }, q2: { paste: 1 } },
      })
    );
  });

  it('untimed and teacher-paced sessions answer without a clock', async () => {
    await seed(QUIZ, quizSession());
    await seed(QUIZ_RESPONSE, quizResponse());
    await assertSucceeds(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), { answers: [answer] })
    );
    await seed(
      QUIZ,
      quizSession({ timeLimitMinutes: 10, sessionMode: 'teacher' })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        answers: [answer, { ...answer, questionId: 'q2' }],
      })
    );
  });

  it('a timed attempt with a running clock still turns in', async () => {
    await seed(QUIZ, quizSession({ timeLimitMinutes: 10 }));
    await seed(
      QUIZ_RESPONSE,
      quizResponse({
        answers: [answer],
        attemptStartedAt: Timestamp.fromMillis(Date.now() - 60_000),
      })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        status: 'completed',
        submittedAt: Date.now(),
        completedAttempts: increment(1),
      })
    );
  });
});

describe('quiz turn-in stamp', () => {
  beforeEach(async () => {
    await seed(QUIZ, quizSession());
    await seed(QUIZ_RESPONSE, quizResponse());
  });

  it('a student cannot write it', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), QUIZ_RESPONSE), {
        status: 'completed',
        submittedAt: Date.now(),
        completedAttempts: increment(1),
        turnIn: { at: 1, claimed: 1 },
      })
    );
  });

  it('a join cannot carry a stamp or input signals', async () => {
    await testEnv.clearFirestore();
    await seed(QUIZ, quizSession({ inputSignals: true }));
    const join = {
      ...quizResponse({ status: 'joined' }),
      lastWriteAt: serverTimestamp(),
    };
    await assertFails(
      setDoc(doc(asStudent(), QUIZ_RESPONSE), {
        ...join,
        turnIn: { at: 1, claimed: 1 },
      })
    );
    await assertFails(
      setDoc(doc(asStudent(), QUIZ_RESPONSE), {
        ...join,
        inputSignals: { '1': {} },
      })
    );
    await assertSucceeds(setDoc(doc(asStudent(), QUIZ_RESPONSE), join));
  });

  it('the teacher still can', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), QUIZ_RESPONSE), {
        turnIn: { at: 1, claimed: 1 },
      })
    );
  });
});
