// The costliest ordinary student writes to a quiz response stay under Firestore's 1,000-expression limit.
// Requires a running Firestore emulator: pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  deleteField,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-expression-budget';
const TEACHER = 'teacher-budget';
const STUDENT = 'student-budget';
const CLASS = 'class-budget';
const SID = 'sess-budget';
const QUIZ = `quiz_sessions/${SID}`;
const RESP = `${QUIZ}/responses/${STUDENT}`;
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let env: RulesTestEnvironment;

const ssoStudent = () =>
  env
    .authenticatedContext(STUDENT, {
      email: '',
      studentRole: true,
      classIds: [CLASS],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const pinStudent = () =>
  env
    .authenticatedContext(STUDENT, {
      email: '',
      studentRole: true,
      classIds: [CLASS],
      pinLogin: true,
      pinSessionId: SID,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

beforeAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [h, p] = host ? host.split(':') : [];
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: h || '127.0.0.1',
      port: p ? Number(p) : 8080,
    },
  });
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), path), data);
  });

const now = Date.now();
const served = Array.from({ length: 120 }, (_, i) => `q${i}`);
const ans = (i: number) => ({
  questionId: `q${i}`,
  answer: 'x'.repeat(50),
  answeredAt: i,
  status: 'submitted',
});
const many = (n: number) => Array.from({ length: n }, (_, i) => ans(i));
const exits = Array.from({ length: 3 }, (_, i) => ({
  leftAt: i + 1,
  returnedAt: i + 2,
  durationMs: 1,
  questionIndex: 0,
  attempt: 0,
  outcome: 'returned',
}));

interface Case {
  pin: boolean;
  period: boolean;
  timed: boolean;
  limit: boolean;
}

const session = (c: Case) => ({
  teacherUid: TEACHER,
  status: 'active',
  code: 'BUDGET1',
  sessionMode: 'student',
  classId: CLASS,
  classIds: [CLASS],
  assignmentId: 'asg-budget',
  ...(c.period ? { periodAccess: { [CLASS]: { state: 'open' } } } : {}),
  ...(c.timed ? { timeLimitMinutes: 30 } : {}),
  ...(c.limit ? { attemptLimit: 3 } : {}),
});
const response = (c: Case, extra: Record<string, unknown> = {}) => ({
  studentUid: STUDENT,
  joinedAt: 1000,
  score: null,
  answers: many(10),
  status: 'in-progress',
  submittedAt: null,
  completedAttempts: 1,
  preSyncVersion: 0,
  lastWriteAt: Timestamp.fromMillis(now - 1000),
  partsDone: 1,
  tabExits: exits,
  tabSwitchWarnings: 3,
  ...(c.period ? { classId: CLASS } : {}),
  ...(c.timed ? { attemptStartedAt: Timestamp.fromMillis(now - 60_000) } : {}),
  ...extra,
});

const writes: Record<
  string,
  (c: Case) => [Record<string, unknown>, Record<string, unknown>]
> = {
  'first answer with the served subset': () => [
    { status: 'joined', answers: [], completedAttempts: 1 },
    {
      answers: [ans(900)],
      status: 'in-progress',
      lastWriteAt: serverTimestamp(),
      servedQuestionIds: served,
    },
  ],
  'a later answer with the served subset': () => [
    {},
    {
      answers: [...many(10), ans(900)],
      status: 'in-progress',
      lastWriteAt: serverTimestamp(),
      servedQuestionIds: served,
    },
  ],
  'a retake': (c) => [
    {
      status: 'completed',
      submittedAt: now - 5000,
      servedQuestionIds: served,
      ...(c.timed ? { timeUp: true } : {}),
    },
    {
      status: 'joined',
      answers: [],
      score: null,
      submittedAt: null,
      preSyncVersion: 0,
      partsDone: deleteField(),
      lastWriteAt: serverTimestamp(),
      ...(c.timed
        ? { attemptStartedAt: serverTimestamp(), timeUp: deleteField() }
        : {}),
    },
  ],
  'a retake that strips the published key': (c) => [
    {
      status: 'completed',
      submittedAt: now - 5000,
      servedQuestionIds: served,
      revealedAnswers: Object.fromEntries(served.map((q) => [q, 'A'])),
      resultsOverride: {
        mode: 'shown',
        visibility: 'score-responses-and-answers',
        publishedAt: 1000,
        revealedAnswers: { q1: 'A' },
        revealedExplanations: { q1: 'Because' },
      },
      ...(c.timed ? { timeUp: true } : {}),
    },
    {
      status: 'joined',
      answers: [],
      score: null,
      submittedAt: null,
      preSyncVersion: 0,
      partsDone: deleteField(),
      lastWriteAt: serverTimestamp(),
      revealedAnswers: deleteField(),
      'resultsOverride.revealedAnswers': deleteField(),
      'resultsOverride.revealedExplanations': deleteField(),
      ...(c.timed
        ? { attemptStartedAt: serverTimestamp(), timeUp: deleteField() }
        : {}),
    },
  ],
  'a turn-in': (c) => [
    { servedQuestionIds: served },
    {
      status: 'completed',
      submittedAt: Date.now(),
      completedAttempts: increment(1),
      ...(c.timed ? { timeUp: true } : {}),
    },
  ],
};

const cases: Case[] = [];
for (const pin of [false, true])
  for (const period of [false, true])
    for (const timed of [false, true])
      for (const limit of [false, true])
        cases.push({ pin, period, timed, limit });

describe('quiz response student writes stay under the expression limit', () => {
  for (const [name, build] of Object.entries(writes)) {
    it(`${name} lands for SSO and PIN students on every session shape`, async () => {
      const failed: string[] = [];
      for (const c of cases) {
        await env.clearFirestore();
        await seed(`student_assignments/${STUDENT}/items/asg-budget`, {
          teacherUid: TEACHER,
          sessionId: SID,
          override: { questionIds: served },
        });
        const [before, patch] = build(c);
        await seed(QUIZ, session(c));
        await seed(RESP, response(c, before));
        const db = c.pin ? pinStudent() : ssoStudent();
        try {
          await updateDoc(doc(db, RESP), patch);
        } catch (e) {
          failed.push(`${JSON.stringify(c)}: ${String((e as Error).message)}`);
        }
      }
      expect(failed).toEqual([]);
    }, 120_000);
  }
});
