// Rules for Review self-paced game responses (QUIZ_REVIEW_SPLIT.md D31): only checkQuizGameAnswerV1 writes answers and points.
// Requires a running Firestore emulator. Invoke via: pnpm run test:rules

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
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-game-responses';
const TEACHER_UID = 'teacher-uid-game';
const STUDENT_UID = 'anon-student-game';
const OTHER_STUDENT_UID = 'anon-student-other';
const GAME = 'quiz_sessions/s-game';
const QUIZ = 'quiz_sessions/s-quiz';
const PIN_KEY = 'pin-period_1-01';
const KEY_PATH = `users/${TEACHER_UID}/quiz_assignments/s-game/key/answers`;
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnon = (uid = STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, { email: `${TEACHER_UID}@school.edu` })
    .firestore();

const joinPayload = () => ({
  studentUid: STUDENT_UID,
  pin: '01',
  classPeriod: 'period_1',
  joinedAt: 1000,
  score: null,
  answers: [],
  status: 'joined',
  completedAttempts: 0,
  preSyncVersion: 0,
  tabSwitchWarnings: 0,
});
const answer = { questionId: 'q1', answer: 'Paris', answeredAt: 2000 };

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
    await setDoc(doc(db, GAME), {
      teacherUid: TEACHER_UID,
      assignmentId: 's-game',
      status: 'active',
      code: 'GAME01',
      sessionMode: 'game',
      widgetKind: 'review',
    });
    await setDoc(doc(db, QUIZ), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'QUIZ01',
      sessionMode: 'student',
    });
    await setDoc(doc(db, KEY_PATH), {
      questions: [{ id: 'q1', type: 'MC', points: 1, correctAnswer: 'Paris' }],
    });
  });
});

const seedResponse = (session: string, extra: Record<string, unknown> = {}) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `${session}/responses/${PIN_KEY}`), {
      ...joinPayload(),
      ...extra,
    });
  });

describe('joining a game', () => {
  it('lets a student join with no answers', async () => {
    await assertSucceeds(
      setDoc(doc(asAnon(), `${GAME}/responses/${PIN_KEY}`), joinPayload())
    );
  });

  it('refuses a join that carries answers or game points', async () => {
    const ref = doc(asAnon(), `${GAME}/responses/${PIN_KEY}`);
    await assertFails(setDoc(ref, { ...joinPayload(), answers: [answer] }));
    await assertFails(
      setDoc(ref, { ...joinPayload(), game: { points: 999, streak: 9 } })
    );
  });

  it('refuses game points at join on any session', async () => {
    await assertFails(
      setDoc(doc(asAnon(), `${QUIZ}/responses/${PIN_KEY}`), {
        ...joinPayload(),
        game: { points: 999 },
      })
    );
  });
});

describe('writing during a game', () => {
  beforeEach(() => seedResponse(GAME));

  it('refuses student-written answers, verdicts and points', async () => {
    const ref = doc(asAnon(), `${GAME}/responses/${PIN_KEY}`);
    await assertFails(updateDoc(ref, { answers: [answer] }));
    await assertFails(
      updateDoc(ref, { answers: [{ ...answer, isCorrect: true }] })
    );
    await assertFails(updateDoc(ref, { game: { points: 50 } }));
    await assertFails(updateDoc(ref, { 'game.points': 50 }));
  });

  it('still lets the student raise a hand, log tab exits and finish', async () => {
    const ref = doc(asAnon(), `${GAME}/responses/${PIN_KEY}`);
    await assertSucceeds(updateDoc(ref, { handRaisedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { tabSwitchWarnings: 1 }));
    await assertSucceeds(
      updateDoc(ref, { status: 'completed', lastWriteAt: serverTimestamp() })
    );
  });

  it('lets the teacher correct answers and points', async () => {
    const ref = doc(asTeacher(), `${GAME}/responses/${PIN_KEY}`);
    await assertSucceeds(updateDoc(ref, { game: { points: 0 }, answers: [] }));
  });
});

describe('reading game responses and the key', () => {
  beforeEach(() => seedResponse(GAME, { game: { points: 3, streak: 1 } }));

  it('lets the student and teacher read the response, not a classmate', async () => {
    await assertSucceeds(getDoc(doc(asAnon(), `${GAME}/responses/${PIN_KEY}`)));
    await assertSucceeds(
      getDoc(doc(asTeacher(), `${GAME}/responses/${PIN_KEY}`))
    );
    await assertFails(
      getDoc(doc(asAnon(OTHER_STUDENT_UID), `${GAME}/responses/${PIN_KEY}`))
    );
  });

  it('keeps the game key teacher-only', async () => {
    await assertFails(getDoc(doc(asAnon(), KEY_PATH)));
    await assertSucceeds(getDoc(doc(asTeacher(), KEY_PATH)));
  });
});

describe('non-game sessions are unchanged', () => {
  beforeEach(() => seedResponse(QUIZ));

  it('still lets a self-paced student write answers', async () => {
    await assertSucceeds(
      updateDoc(doc(asAnon(), `${QUIZ}/responses/${PIN_KEY}`), {
        answers: [answer],
        status: 'in-progress',
        lastWriteAt: serverTimestamp(),
      })
    );
  });

  it('still lets a student join with answers already in the payload', async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), QUIZ), {
        teacherUid: TEACHER_UID,
        status: 'active',
        code: 'QUIZ01',
      });
    });
    await assertSucceeds(
      setDoc(doc(asAnon(), `${QUIZ}/responses/${PIN_KEY}`), {
        ...joinPayload(),
        answers: [answer],
      })
    );
  });
});
