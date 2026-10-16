// Rules agree with utils/videoActivityState.ts: teacher pacing writes land, students can read but never pace, and response patches pass.
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
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  increment,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  completionPatch,
  livePacingPatch,
  unlockPatch,
  type VaLiveEvent,
} from '@/utils/videoActivityState';

const PROJECT_ID = 'spartboard-va-state-transitions';
const TEACHER_UID = 'teacher-va-state';
const ANON_UID = 'anon-va-state';
const SSO_UID = 'sso-va-state';
const CLASS_A = 'class-a';
const SESSION_ID = 'va-state-session';
const SESSION_PATH = `video_activity_sessions/${SESSION_ID}`;
const RESPONSE_PATH = `${SESSION_PATH}/responses/${SSO_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: `${TEACHER_UID}@example.com`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asSsoStudent = () =>
  testEnv
    .authenticatedContext(SSO_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const ops = { arrayUnion, arrayRemove, increment };

const liveBlock = (over: Record<string, unknown> = {}) => ({
  currentQuestionId: null,
  questionPhase: 'closed',
  resultsShown: false,
  answerRevealed: false,
  askedQuestionIds: [],
  skippedQuestionIds: [],
  playheadSeconds: 0,
  updatedAt: 1,
  ...over,
});

const seedSession = async (fields: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), SESSION_PATH), {
      id: SESSION_ID,
      activityId: 'act-1',
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
      sessionMode: 'teacher',
      classIds: [CLASS_A],
      createdAt: 1,
      questions: [],
      publicQuestions: [{ id: 'q1', timestamp: 5, text: 'Q?', type: 'MC' }],
      live: liveBlock(),
      ...fields,
    });
  });
};

const seedResponse = async (fields: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), RESPONSE_PATH), {
      studentUid: SSO_UID,
      joinedAt: 1,
      answers: [{ questionId: 'q1', answer: 'A', answeredAt: 2 }],
      completedAt: null,
      score: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
      ...fields,
    });
  });
};

const pacing = (event: VaLiveEvent) =>
  livePacingPatch(event, 1000, ops) as Record<string, unknown>;

// Each allowed pacing transition, with the stored state it starts from.
const ALLOWED: [string, Record<string, unknown>, VaLiveEvent][] = [
  ['start from the lobby', { status: 'waiting' }, { type: 'start' }],
  [
    'open from watching',
    {},
    { type: 'open', questionId: 'q1', playheadSeconds: 5 },
  ],
  [
    'resume from a question',
    { live: liveBlock({ currentQuestionId: 'q1', questionPhase: 'open' }) },
    { type: 'resume', playheadSeconds: 6 },
  ],
  [
    'show results on a question',
    { live: liveBlock({ currentQuestionId: 'q1', questionPhase: 'open' }) },
    { type: 'showResults', shown: true },
  ],
  [
    'reveal on a question',
    { live: liveBlock({ currentQuestionId: 'q1', questionPhase: 'open' }) },
    { type: 'reveal', revealed: true, correctAnswer: 'A' },
  ],
  [
    'skip while watching',
    {},
    { type: 'skip', questionIds: ['q1'], playheadSeconds: 9 },
  ],
  ['end from watching', {}, { type: 'end', playheadSeconds: 10 }],
  [
    'end from the lobby',
    { status: 'waiting' },
    { type: 'end', playheadSeconds: 0 },
  ],
];

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

describe('video_activity_sessions: live pacing transitions', () => {
  for (const [name, stored, event] of ALLOWED) {
    it(`the owning teacher can ${name}`, async () => {
      await seedSession(stored);
      await assertSucceeds(
        updateDoc(doc(asTeacher(), SESSION_PATH), pacing(event))
      );
    });

    it(`no student can ${name}`, async () => {
      await seedSession(stored);
      for (const db of [asAnonStudent(), asSsoStudent()]) {
        await assertFails(updateDoc(doc(db, SESSION_PATH), pacing(event)));
      }
    });
  }

  it('students can read the session in every phase', async () => {
    for (const fields of [
      { status: 'waiting' },
      {},
      { live: liveBlock({ currentQuestionId: 'q1', questionPhase: 'open' }) },
      { status: 'ended' },
    ]) {
      await seedSession(fields);
      await assertSucceeds(getDoc(doc(asAnonStudent(), SESSION_PATH)));
      await assertSucceeds(getDoc(doc(asSsoStudent(), SESSION_PATH)));
    }
  });

  it('an ended live run refuses Start, as the transition table does', async () => {
    await seedSession({ status: 'ended' });
    await assertFails(
      updateDoc(doc(asTeacher(), SESSION_PATH), pacing({ type: 'start' }))
    );
  });
});

describe('video_activity_sessions responses: lifecycle patches', () => {
  it('a student can complete an in-progress attempt once', async () => {
    await seedSession({ sessionMode: 'student' });
    await seedResponse({});
    const patch = completionPatch(
      { completedAt: null, completedAttempts: 0 },
      2000,
      ops
    ) as Record<string, unknown>;
    await assertSucceeds(updateDoc(doc(asSsoStudent(), RESPONSE_PATH), patch));
    await assertFails(
      updateDoc(doc(asSsoStudent(), RESPONSE_PATH), { completedAt: 3000 })
    );
  });

  it('a student finishing an unlocked attempt clears the unlock', async () => {
    await seedSession({ sessionMode: 'student' });
    await seedResponse({ unlocked: true });
    const patch = completionPatch(
      { completedAt: null, unlocked: true, completedAttempts: 0 },
      2000,
      ops
    ) as Record<string, unknown>;
    await assertSucceeds(updateDoc(doc(asSsoStudent(), RESPONSE_PATH), patch));
  });

  it('only the teacher can unlock a completed attempt', async () => {
    await seedSession({ sessionMode: 'student' });
    await seedResponse({ completedAt: 1500, completedAttempts: 1 });
    const patch = unlockPatch(
      { completedAt: 1500, completedAttempts: 1 },
      2000
    );
    await assertFails(updateDoc(doc(asSsoStudent(), RESPONSE_PATH), patch));
    await assertSucceeds(updateDoc(doc(asTeacher(), RESPONSE_PATH), patch));
  });

  it('students can read their own response and not another student’s', async () => {
    await seedSession({ sessionMode: 'student' });
    await seedResponse({});
    await assertSucceeds(getDoc(doc(asSsoStudent(), RESPONSE_PATH)));
    await assertFails(getDoc(doc(asAnonStudent(), RESPONSE_PATH)));
  });
});
