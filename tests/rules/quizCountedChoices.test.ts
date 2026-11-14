// Rules tests: `countedChoices` (which answers count in a choose-N section) is teacher-written only.
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
import {
  setDoc,
  updateDoc,
  getDoc,
  doc,
  deleteField,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-counted-choices-test';
const SESSION_ID = 'session-counted';
const TEACHER_UID = 'teacher-uid-counted';
const OTHER_TEACHER_UID = 'teacher-uid-other';
const STUDENT_UID = 'anon-counted-uid';
const OTHER_STUDENT_UID = 'anon-other-uid';
const CLASS_ID = 'class-counted';
const PIN_KEY = 'pin-period_1-01';
const RESPONSE_PATH = `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = (uid = STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@school.edu`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const choices = { attempt: 1, bySection: { s1: ['q2', 'q3'] } };

const baseResponse = () => ({
  studentUid: STUDENT_UID,
  pin: '01',
  classPeriod: 'period_1',
  joinedAt: Date.now(),
  score: null,
  answers: [],
  status: 'joined' as const,
  completedAttempts: 0,
  preSyncVersion: 0,
  tabSwitchWarnings: 0,
});

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
      code: 'COUNTD',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
    });
    await setDoc(doc(ctx.firestore(), RESPONSE_PATH), {
      ...baseResponse(),
      status: 'completed',
      completedAttempts: 1,
    });
  });
});

const seedChoices = () =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), RESPONSE_PATH), {
      countedChoices: choices,
    });
  });

describe('countedChoices writes', () => {
  it('the session teacher sets the pick', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), RESPONSE_PATH), { countedChoices: choices })
    );
  });

  it('the session teacher clears the pick', async () => {
    await seedChoices();
    await assertSucceeds(
      updateDoc(doc(asTeacher(), RESPONSE_PATH), {
        countedChoices: deleteField(),
      })
    );
  });

  it('another teacher cannot set it', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), RESPONSE_PATH), {
        countedChoices: choices,
      })
    );
  });

  it('the student cannot set it on their own response', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), { countedChoices: choices })
    );
  });

  it('the student cannot clear a teacher pick', async () => {
    await seedChoices();
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        countedChoices: deleteField(),
      })
    );
  });

  it('the student cannot create a response that carries one', async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        code: 'COUNTD',
        classId: CLASS_ID,
        classIds: [CLASS_ID],
      });
    });
    await assertSucceeds(
      setDoc(doc(asStudent(), RESPONSE_PATH), baseResponse())
    );
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        code: 'COUNTD',
        classId: CLASS_ID,
        classIds: [CLASS_ID],
      });
    });
    await assertFails(
      setDoc(doc(asStudent(), RESPONSE_PATH), {
        ...baseResponse(),
        countedChoices: choices,
      })
    );
  });
});

describe('countedChoices reads', () => {
  it('the session teacher reads the response with its pick', async () => {
    await seedChoices();
    await assertSucceeds(getDoc(doc(asTeacher(), RESPONSE_PATH)));
  });

  it('the owning student reads their response with its pick', async () => {
    await seedChoices();
    await assertSucceeds(getDoc(doc(asStudent(), RESPONSE_PATH)));
  });

  it('another student cannot read it', async () => {
    await seedChoices();
    await assertFails(getDoc(doc(asStudent(OTHER_STUDENT_UID), RESPONSE_PATH)));
  });

  it('another teacher cannot read it', async () => {
    await seedChoices();
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER_UID), RESPONSE_PATH)));
  });
});
