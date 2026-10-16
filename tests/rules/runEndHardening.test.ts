// Student response writes stop when a Quiz or Video Activity run ends, status only moves forward
// (or back through a retake under the cap or a teacher unlock), and turned-in Guided Learning work stays put.
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
import { doc, getDoc, increment, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-run-end-hardening';
const TEACHER_UID = 'teacher-run-end';
const ANON_UID = 'anon-run-end';
const SSO_UID = 'sso-run-end';
const CLASS_A = 'class-a';
const PIN_KEY = 'pin-p1-1234';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: `${TEACHER_UID}@example.org`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnon = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asSso = () =>
  testEnv
    .authenticatedContext(SSO_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

type Db = ReturnType<typeof asTeacher>;

const longAgo = () => Date.now() - 10 * 60 * 1000;
const justNow = () => Date.now() - 5 * 1000;

const answer = (id: string) => ({
  questionId: id,
  answer: 'a',
  answeredAt: 1,
  status: 'submitted',
});

const seed = async (path: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
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
});

// ─── Quiz ─────────────────────────────────────────────────────────────────────

const QUIZ = 'quiz_sessions/run-end-quiz';
const quizResponse = (db: Db) => doc(db, `${QUIZ}/responses/${PIN_KEY}`);

const seedQuiz = (session: Record<string, unknown> = {}) =>
  seed(QUIZ, {
    teacherUid: TEACHER_UID,
    status: 'active',
    sessionMode: 'student',
    mode: 'submissions',
    code: 'RUNEND',
    totalQuestions: 2,
    attemptLimit: null,
    ...session,
  });

const seedQuizResponse = (over: Record<string, unknown> = {}) =>
  seed(`${QUIZ}/responses/${PIN_KEY}`, {
    studentUid: ANON_UID,
    pin: '1234',
    classPeriod: 'p1',
    joinedAt: 1000,
    score: null,
    status: 'in-progress',
    answers: [answer('q1')],
    completedAttempts: 0,
    tabSwitchWarnings: 0,
    ...over,
  });

const quizJoin = () => ({
  studentUid: ANON_UID,
  pin: '1234',
  classPeriod: 'p1',
  joinedAt: 1000,
  score: null,
  status: 'joined',
  answers: [],
  completedAttempts: 0,
});

describe('quiz responses after the run ends', () => {
  it('still lets a PIN student with no account join an open run', async () => {
    await seedQuiz();
    await assertSucceeds(setDoc(quizResponse(asAnon()), quizJoin()));
    await assertSucceeds(getDoc(quizResponse(asAnon())));
  });

  it('refuses a join once the run has ended', async () => {
    await seedQuiz({ status: 'ended', endedAt: longAgo() });
    await assertFails(setDoc(quizResponse(asAnon()), quizJoin()));
  });

  it('keeps a save that lands within the grace after End', async () => {
    await seedQuiz({ status: 'ended', endedAt: justNow() });
    await seedQuizResponse();
    await assertSucceeds(
      updateDoc(quizResponse(asAnon()), {
        answers: [answer('q1'), answer('q2')],
      })
    );
  });

  it('refuses answers and turning in after the grace', async () => {
    await seedQuiz({ status: 'ended', endedAt: longAgo() });
    await seedQuizResponse();
    await assertFails(
      updateDoc(quizResponse(asAnon()), {
        answers: [answer('q1'), answer('q2')],
      })
    );
    await assertFails(
      updateDoc(quizResponse(asAnon()), {
        status: 'completed',
        submittedAt: 5,
        completedAttempts: increment(1),
      })
    );
  });

  it('still takes results-view counters and reads after End', async () => {
    await seedQuiz({ status: 'ended', endedAt: longAgo() });
    await seedQuizResponse({ status: 'completed', completedAttempts: 1 });
    await assertSucceeds(
      updateDoc(quizResponse(asAnon()), { resultsTabWarnings: 1 })
    );
    await assertSucceeds(getDoc(quizResponse(asAnon())));
    await assertSucceeds(getDoc(quizResponse(asTeacher())));
  });

  it('lets the teacher grade and turn in work after End', async () => {
    await seedQuiz({ status: 'ended', endedAt: longAgo() });
    await seedQuizResponse();
    await assertSucceeds(
      updateDoc(quizResponse(asTeacher()), {
        status: 'completed',
        completedAttempts: 1,
      })
    );
  });

  it('accepts student writes again once the teacher reopens', async () => {
    await seedQuiz({ status: 'ended', endedAt: longAgo() });
    await seedQuizResponse();
    await assertSucceeds(
      updateDoc(doc(asTeacher(), QUIZ), { status: 'paused' })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(), QUIZ), { status: 'active' })
    );
    await assertSucceeds(
      updateDoc(quizResponse(asAnon()), {
        answers: [answer('q1'), answer('q2')],
      })
    );
  });
});

describe('quiz response status moves', () => {
  it('turns in with exactly one more attempt', async () => {
    await seedQuiz();
    await seedQuizResponse();
    await assertFails(
      updateDoc(quizResponse(asAnon()), {
        status: 'completed',
        submittedAt: 5,
      })
    );
    await assertSucceeds(
      updateDoc(quizResponse(asAnon()), {
        status: 'completed',
        submittedAt: 5,
        completedAttempts: increment(1),
      })
    );
  });

  it('allows a retake under the cap, with answers cleared', async () => {
    await seedQuiz({ attemptLimit: 2 });
    await seedQuizResponse({ status: 'completed', completedAttempts: 1 });
    await assertFails(
      updateDoc(quizResponse(asAnon()), { status: 'joined', score: null })
    );
    await assertSucceeds(
      updateDoc(quizResponse(asAnon()), {
        status: 'joined',
        answers: [],
        score: null,
        submittedAt: null,
      })
    );
  });

  it('refuses a retake at the cap', async () => {
    await seedQuiz({ attemptLimit: 2 });
    await seedQuizResponse({ status: 'completed', completedAttempts: 2 });
    await assertFails(
      updateDoc(quizResponse(asAnon()), { status: 'joined', answers: [] })
    );
  });

  it('counts a turned-in response with no attempt recorded as one', async () => {
    await seedQuiz({ attemptLimit: 1 });
    await seedQuizResponse({ status: 'completed', completedAttempts: 0 });
    await assertFails(
      updateDoc(quizResponse(asAnon()), { status: 'joined', answers: [] })
    );
  });

  it('allows unlimited retakes when there is no cap', async () => {
    await seedQuiz({ attemptLimit: null });
    await seedQuizResponse({ status: 'completed', completedAttempts: 5 });
    await assertSucceeds(
      updateDoc(quizResponse(asAnon()), { status: 'joined', answers: [] })
    );
  });

  it('reopens a turned-in attempt only after a teacher unlock', async () => {
    await seedQuiz();
    await seedQuizResponse({ status: 'completed', completedAttempts: 1 });
    await assertFails(
      updateDoc(quizResponse(asAnon()), {
        status: 'in-progress',
        submittedAt: null,
      })
    );
    await seed(`${QUIZ}/responses/${PIN_KEY}`, {
      studentUid: ANON_UID,
      pin: '1234',
      classPeriod: 'p1',
      joinedAt: 1000,
      score: null,
      status: 'completed',
      answers: [answer('q1')],
      completedAttempts: 1,
      unlocked: true,
    });
    await assertSucceeds(
      updateDoc(quizResponse(asAnon()), {
        status: 'in-progress',
        submittedAt: null,
      })
    );
  });

  it('refuses moving an in-progress attempt back to joined', async () => {
    await seedQuiz();
    await seedQuizResponse();
    await assertFails(
      updateDoc(quizResponse(asAnon()), { status: 'joined', answers: [] })
    );
  });

  it('accepts the first answer moving joined to in-progress', async () => {
    await seedQuiz();
    await seedQuizResponse({ status: 'joined', answers: [] });
    await assertSucceeds(
      updateDoc(quizResponse(asAnon()), {
        status: 'in-progress',
        answers: [answer('q1')],
      })
    );
  });
});

describe('quiz session status stays teacher-only', () => {
  it('lets the teacher write each run status and nothing else', async () => {
    await seedQuiz();
    for (const status of ['paused', 'active', 'waiting', 'ended']) {
      await assertSucceeds(updateDoc(doc(asTeacher(), QUIZ), { status }));
    }
    await assertFails(updateDoc(doc(asTeacher(), QUIZ), { status: 'done' }));
  });

  it('refuses students who try to end or reopen a run', async () => {
    await seedQuiz({ status: 'ended', endedAt: longAgo() });
    await assertFails(updateDoc(doc(asAnon(), QUIZ), { status: 'active' }));
    await assertFails(updateDoc(doc(asSso(), QUIZ), { status: 'active' }));
  });
});

// ─── Video Activity ───────────────────────────────────────────────────────────

const VA = 'video_activity_sessions/run-end-va';
const vaResponse = (db: Db) => doc(db, `${VA}/responses/${PIN_KEY}`);

const seedVa = (session: Record<string, unknown> = {}) =>
  seed(VA, {
    id: 'run-end-va',
    teacherUid: TEACHER_UID,
    activityId: 'act-1',
    createdAt: 1,
    status: 'active',
    mode: 'submissions',
    sessionOptions: { attemptLimit: null },
    ...session,
  });

const vaAnswer = (id: string) => ({ questionId: id, answer: 'a' });

const seedVaResponse = (over: Record<string, unknown> = {}) =>
  seed(`${VA}/responses/${PIN_KEY}`, {
    studentUid: ANON_UID,
    pin: '1234',
    name: 'Student',
    joinedAt: 1000,
    score: null,
    answers: [vaAnswer('q1')],
    completedAt: null,
    completedAttempts: 0,
    tabSwitchWarnings: 0,
    ...over,
  });

const vaJoin = () => ({
  studentUid: ANON_UID,
  pin: '1234',
  name: 'Student',
  joinedAt: 1000,
  score: null,
  answers: [],
  completedAt: null,
  completedAttempts: 0,
  tabSwitchWarnings: 0,
});

describe('video activity responses after the run ends', () => {
  it('still lets a PIN student with no account join an open run', async () => {
    await seedVa();
    await assertSucceeds(setDoc(vaResponse(asAnon()), vaJoin()));
  });

  it('refuses a join once the run has ended or is paused', async () => {
    await seedVa({ status: 'ended', endedAt: longAgo() });
    await assertFails(setDoc(vaResponse(asAnon()), vaJoin()));
  });

  it('refuses answers and a retake after the grace', async () => {
    await seedVa({ status: 'ended', endedAt: longAgo() });
    await seedVaResponse();
    await assertFails(
      updateDoc(vaResponse(asAnon()), {
        answers: [vaAnswer('q1'), vaAnswer('q2')],
      })
    );
    await seedVaResponse({ completedAt: 5, completedAttempts: 1 });
    await assertFails(
      updateDoc(vaResponse(asAnon()), { completedAt: null, answers: [] })
    );
  });

  it('keeps an answer that lands within the grace after End', async () => {
    await seedVa({ status: 'ended', endedAt: justNow() });
    await seedVaResponse();
    await assertSucceeds(
      updateDoc(vaResponse(asAnon()), {
        answers: [vaAnswer('q1'), vaAnswer('q2')],
      })
    );
  });

  it('lets a live student finish after the run ends', async () => {
    await seedVa({
      status: 'ended',
      endedAt: longAgo(),
      sessionMode: 'teacher',
      live: { questionPhase: 'closed' },
    });
    await seedVaResponse();
    await assertSucceeds(
      updateDoc(vaResponse(asAnon()), {
        completedAt: 10,
        completedAttempts: increment(1),
      })
    );
    await assertSucceeds(getDoc(vaResponse(asAnon())));
  });

  it('still takes results-view counters after End', async () => {
    await seedVa({ status: 'ended', endedAt: longAgo() });
    await seedVaResponse({ completedAt: 5, completedAttempts: 1 });
    await assertSucceeds(
      updateDoc(vaResponse(asAnon()), { resultsTabWarnings: 1 })
    );
  });
});

describe('video activity completion moves', () => {
  it('finishes with exactly one more attempt', async () => {
    await seedVa();
    await seedVaResponse();
    await assertFails(updateDoc(vaResponse(asAnon()), { completedAt: 10 }));
    await assertSucceeds(
      updateDoc(vaResponse(asAnon()), {
        completedAt: 10,
        completedAttempts: increment(1),
      })
    );
  });

  it('reopens a finished attempt only after a teacher unlock', async () => {
    await seedVa();
    await seedVaResponse({ completedAt: 5, completedAttempts: 1 });
    await assertFails(updateDoc(vaResponse(asAnon()), { completedAt: null }));
    await seedVaResponse({
      completedAt: 5,
      completedAttempts: 1,
      unlocked: true,
    });
    await assertSucceeds(
      updateDoc(vaResponse(asAnon()), { completedAt: null })
    );
  });

  it('allows a retake under the cap and refuses one at it', async () => {
    await seedVa({ sessionOptions: { attemptLimit: 2 } });
    await seedVaResponse({ completedAt: 5, completedAttempts: 1 });
    await assertSucceeds(
      updateDoc(vaResponse(asAnon()), { completedAt: null, answers: [] })
    );
    await seedVaResponse({ completedAt: 5, completedAttempts: 2 });
    await assertFails(
      updateDoc(vaResponse(asAnon()), { completedAt: null, answers: [] })
    );
  });
});

describe('video activity session status stays teacher-only', () => {
  it('refuses a status the run never uses', async () => {
    await seedVa();
    await assertFails(updateDoc(doc(asTeacher(), VA), { status: 'paused' }));
    await assertSucceeds(
      updateDoc(doc(asTeacher(), VA), { status: 'ended', endedAt: 5 })
    );
  });

  it('lets the teacher resume a paused self-paced run', async () => {
    await seedVa({ status: 'ended', endedAt: longAgo() });
    await assertSucceeds(updateDoc(doc(asTeacher(), VA), { status: 'active' }));
  });

  it('refuses pacing writes on an ended live run', async () => {
    await seedVa({
      status: 'ended',
      endedAt: longAgo(),
      sessionMode: 'teacher',
      live: { questionPhase: 'closed', currentQuestionId: null },
    });
    await assertFails(
      updateDoc(doc(asTeacher(), VA), {
        'live.currentQuestionId': 'q2',
        'live.questionPhase': 'open',
      })
    );
    await assertSucceeds(updateDoc(doc(asTeacher(), VA), { title: 'Renamed' }));
  });

  it('refuses students who try to change the run', async () => {
    await seedVa({ sessionMode: 'teacher', live: { questionPhase: 'closed' } });
    for (const db of [asAnon(), asSso()]) {
      await assertFails(updateDoc(doc(db, VA), { status: 'ended' }));
      await assertFails(
        updateDoc(doc(db, VA), { 'live.questionPhase': 'open' })
      );
    }
  });
});

// ─── Guided Learning ──────────────────────────────────────────────────────────

const GL = 'guided_learning_sessions/run-end-gl';
const glResponse = (db: Db, uid = ANON_UID) =>
  doc(db, `${GL}/responses/${uid}`);

const seedGl = () =>
  seed(GL, {
    teacherUid: TEACHER_UID,
    assignmentMode: 'submissions',
    title: 'Lesson',
  });

const glStart = (over: Record<string, unknown> = {}) => ({
  sessionId: 'run-end-gl',
  studentAnonymousId: ANON_UID,
  pin: '1234',
  answers: [{ stepId: 's1', answer: 'a', isCorrect: null }],
  startedAt: 1,
  completedAt: null,
  score: null,
  classPeriod: 'p1',
  ...over,
});

describe('guided learning responses', () => {
  it('lets a PIN student start and read their response', async () => {
    await seedGl();
    await assertSucceeds(setDoc(glResponse(asAnon()), glStart()));
    await assertSucceeds(getDoc(glResponse(asAnon())));
    await assertSucceeds(getDoc(glResponse(asTeacher())));
  });

  it('refuses extra fields on the first write', async () => {
    await seedGl();
    await assertFails(
      setDoc(glResponse(asAnon()), glStart({ resultsTabWarnings: -100 }))
    );
  });

  it('turns in once with a number and then keeps the work', async () => {
    await seedGl();
    await seed(`${GL}/responses/${ANON_UID}`, glStart());
    await assertFails(updateDoc(glResponse(asAnon()), { completedAt: 'now' }));
    await assertSucceeds(updateDoc(glResponse(asAnon()), { completedAt: 10 }));
    await assertFails(
      updateDoc(glResponse(asAnon()), {
        answers: [
          { stepId: 's1', answer: 'b', isCorrect: null },
          { stepId: 's2', answer: 'c', isCorrect: null },
        ],
      })
    );
    await assertFails(updateDoc(glResponse(asAnon()), { completedAt: 20 }));
    await assertFails(updateDoc(glResponse(asAnon()), { completedAt: null }));
  });

  it('keeps saving answers before the student turns in', async () => {
    await seedGl();
    await seed(`${GL}/responses/${ANON_UID}`, glStart());
    await assertSucceeds(
      updateDoc(glResponse(asAnon()), {
        answers: [
          { stepId: 's1', answer: 'a', isCorrect: null },
          { stepId: 's2', answer: 'c', isCorrect: null },
        ],
      })
    );
  });

  it('lets the teacher grade a turned-in response', async () => {
    await seedGl();
    await seed(`${GL}/responses/${ANON_UID}`, glStart({ completedAt: 10 }));
    await assertSucceeds(updateDoc(glResponse(asTeacher()), { score: 100 }));
  });

  it('refuses students who try to change the session', async () => {
    await seedGl();
    for (const db of [asAnon(), asSso()]) {
      await assertFails(updateDoc(doc(db, GL), { closeAt: 5 }));
      await assertFails(updateDoc(doc(db, GL), { scoreVisibility: 'score' }));
    }
  });
});
