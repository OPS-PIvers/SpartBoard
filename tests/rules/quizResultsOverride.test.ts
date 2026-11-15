// Rules tests: per-student results publication (`resultsOverride`) and the
// per-response answer key (`revealedAnswers`) are teacher-written only.
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
import { setDoc, updateDoc, doc, deleteField } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-results-override-test';
const SESSION_ID = 'session-override';
const TEACHER_UID = 'teacher-uid-override';
const ANON_UID = 'anon-override-uid';
const CLASS_ID = 'class-override';
const PIN_KEY = 'pin-period_1-01';
const RESPONSE_PATH = `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const baseResponse = () => ({
  studentUid: ANON_UID,
  pin: '01',
  classPeriod: 'period_1',
  joinedAt: 1000,
  score: null,
  answers: [],
  status: 'joined' as const,
  completedAttempts: 0,
  preSyncVersion: 0,
  tabSwitchWarnings: 0,
});

const shownOverride = {
  mode: 'shown',
  visibility: 'score-responses-and-answers',
  publishedAt: 1000,
  expiresAt: null,
  revealedAnswers: { q1: 'A' },
};

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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'OVERRD',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
    });
  });
});

const seedResponse = async (extra: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), RESPONSE_PATH), {
      ...baseResponse(),
      status: 'completed',
      ...extra,
    });
  });
};

describe('quiz response CREATE — results publication fields', () => {
  it('control: minimal valid CREATE succeeds', async () => {
    await assertSucceeds(
      setDoc(doc(asAnonStudent(), RESPONSE_PATH), baseResponse())
    );
  });

  it('CREATE with resultsOverride is REJECTED', async () => {
    await assertFails(
      setDoc(doc(asAnonStudent(), RESPONSE_PATH), {
        ...baseResponse(),
        resultsOverride: shownOverride,
      })
    );
  });

  it('CREATE with revealedAnswers is REJECTED', async () => {
    await assertFails(
      setDoc(doc(asAnonStudent(), RESPONSE_PATH), {
        ...baseResponse(),
        revealedAnswers: { q1: 'A' },
      })
    );
  });
});

describe('quiz response UPDATE — results publication fields', () => {
  it('student cannot add a resultsOverride', async () => {
    await seedResponse();
    await assertFails(
      updateDoc(doc(asAnonStudent(), RESPONSE_PATH), {
        resultsOverride: shownOverride,
      })
    );
  });

  it('student cannot clear a Hidden override', async () => {
    await seedResponse({
      resultsOverride: { mode: 'hidden', publishedAt: 1000 },
    });
    await assertFails(
      updateDoc(doc(asAnonStudent(), RESPONSE_PATH), {
        resultsOverride: deleteField(),
      })
    );
  });

  it('student cannot write revealedAnswers', async () => {
    await seedResponse();
    await assertFails(
      updateDoc(doc(asAnonStudent(), RESPONSE_PATH), {
        revealedAnswers: { q1: 'A' },
      })
    );
  });

  it('teacher can write a resultsOverride', async () => {
    await seedResponse();
    await assertSucceeds(
      updateDoc(doc(asTeacher(), RESPONSE_PATH), {
        resultsOverride: shownOverride,
        revealedAnswers: { q1: 'A' },
      })
    );
  });
});
