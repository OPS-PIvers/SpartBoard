// Firestore rules for the unusual-input counters (`inputSignals`) on quiz responses.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

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
  setDoc,
  updateDoc,
  getDoc,
  doc,
  Timestamp,
  deleteField,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-input-signals';
const TEACHER_UID = 'teacher-uid-inputsignals';
const STUDENT_UID = 'student-uid-inputsignals';
const OTHER_UID = 'other-uid-inputsignals';
const QUIZ_SESSION = 'quiz-session-inputsignals';
const PIN_KEY = 'pin-period_1-01';

const SESSION = `quiz_sessions/${QUIZ_SESSION}`;
const RESPONSE = `quiz_sessions/${QUIZ_SESSION}/responses/${PIN_KEY}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const anon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
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
    const db = ctx.firestore();
    await setDoc(doc(db, SESSION), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'INSIGNL',
      inputSignals: true,
    });
    await setDoc(doc(db, RESPONSE), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAttempts: 0,
      status: 'in-progress',
      submittedAt: null,
      preSyncVersion: 0,
      lastWriteAt: Timestamp.fromMillis(1000),
    });
  });
});

const response = (db: ReturnType<typeof asStudent>) => doc(db, RESPONSE);

describe('inputSignals on quiz responses', () => {
  it('lets the student save and extend their own counters', async () => {
    await assertSucceeds(
      updateDoc(response(asStudent()), {
        'inputSignals.0': { q1: { clicks: 3, jumpClicks: 2 } },
      })
    );
    await assertSucceeds(
      updateDoc(response(asStudent()), {
        'inputSignals.0': { q1: { clicks: 5 }, q2: { keys: 12 } },
      })
    );
  });

  it('refuses another student', async () => {
    await assertFails(
      updateDoc(response(asOther()), {
        'inputSignals.0': { q1: { clicks: 1 } },
      })
    );
  });

  it('lets the teacher read them', async () => {
    await assertSucceeds(
      updateDoc(response(asStudent()), {
        'inputSignals.0': { q1: { scripted: 1 } },
      })
    );
    await assertSucceeds(getDoc(response(asTeacher())));
  });
});

describe('inputSignals integrity', () => {
  const seedResponse = async (fields: Record<string, unknown>) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), RESPONSE), fields);
    });
  };
  const seedSession = async (fields: Record<string, unknown>) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), SESSION), fields);
    });
  };
  const earlier = { '0': { q1: { clicks: 9, pastes: 4 } } };

  it('keeps the normal periodic save working on a retake', async () => {
    await seedResponse({ completedAttempts: 1, inputSignals: earlier });
    await assertSucceeds(
      updateDoc(response(asStudent()), {
        'inputSignals.1': { q1: { clicks: 2 } },
      })
    );
    await assertSucceeds(
      updateDoc(response(asStudent()), {
        'inputSignals.1': { q1: { clicks: 4 }, q2: { keys: 1 } },
      })
    );
  });

  it('refuses removing the field', async () => {
    await seedResponse({ completedAttempts: 1, inputSignals: earlier });
    await assertFails(
      updateDoc(response(asStudent()), { inputSignals: deleteField() })
    );
  });

  it("refuses replacing or clearing a finished attempt's entry", async () => {
    await seedResponse({ completedAttempts: 1, inputSignals: earlier });
    await assertFails(
      updateDoc(response(asStudent()), {
        'inputSignals.0': { q1: { clicks: 1 } },
      })
    );
    await assertFails(
      updateDoc(response(asStudent()), { 'inputSignals.0': deleteField() })
    );
    await assertFails(
      updateDoc(response(asStudent()), {
        inputSignals: { '1': { q1: { clicks: 1 } } },
      })
    );
  });

  it('refuses a non-map value', async () => {
    await assertFails(
      updateDoc(response(asStudent()), { inputSignals: 'none' })
    );
    await assertFails(
      updateDoc(response(asStudent()), { 'inputSignals.0': 'none' })
    );
  });

  it('refuses an oversized entry', async () => {
    const big: Record<string, { clicks: number }> = {};
    for (let i = 0; i < 501; i++) big[`q${i}`] = { clicks: 1 };
    await assertFails(
      updateDoc(response(asStudent()), { 'inputSignals.0': big })
    );
  });

  it('refuses a session that does not record input signals', async () => {
    await seedSession({ inputSignals: false });
    await assertFails(
      updateDoc(response(asStudent()), {
        'inputSignals.0': { q1: { clicks: 1 } },
      })
    );
  });
});
