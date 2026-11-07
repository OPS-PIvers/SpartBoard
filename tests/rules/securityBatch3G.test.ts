// Rules tests for security batch 3G: a Mini App created with summaryHidden keeps the graded
// summary teacher-only, and the student reads a score-free receipt instead.
// Requires a running Firestore emulator; invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-security-3g-test';
const TEACHER_UID = 'teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const STUDENT_UID = 'student-uid';
const OTHER_STUDENT_UID = 'other-student-uid';
const ANON_UID = 'anon-uid';
const CLASS_A = 'class-A';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.org`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = (uid = STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnon = (uid = ANON_UID) =>
  testEnv
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const sessionPath = (id: string) => `mini_app_sessions/${id}`;
const summaryPath = (id: string, key: string) =>
  `mini_app_sessions/${id}/submissions/${key}`;
const receiptPath = (id: string, key: string) =>
  `mini_app_sessions/${id}/receipts/${key}`;

const sessionDoc = (extra: Record<string, unknown> = {}) => ({
  teacherUid: TEACHER_UID,
  appId: 'app-1',
  appTitle: 'Fractions',
  appHtml: '<html></html>',
  assignmentName: 'Fractions',
  status: 'active',
  createdAt: 1,
  mode: 'submissions',
  submissionsEnabled: true,
  classIds: [CLASS_A],
  resultsVersion: 2,
  attemptLimit: 2,
  ...extra,
});

const summary = (uid: string) => ({
  submittedAt: 1000,
  studentUid: uid,
  payload: { items: [] },
  attemptCount: 1,
  best: {
    score: 1,
    maxScore: 2,
    attemptNo: 1,
    items: [{ id: 'q1', correct: false, by: 'server' }],
  },
});

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
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
  await testEnv.withSecurityRulesDisabled((ctx) =>
    seedDistrictStaff(ctx.firestore(), [
      `${TEACHER_UID}@example.org`,
      `${OTHER_TEACHER_UID}@example.org`,
    ])
  );
});

describe('Mini App with correct answers hidden', () => {
  beforeEach(async () => {
    await seed(
      sessionPath('hid'),
      sessionDoc({ showCorrectAnswers: false, summaryHidden: true })
    );
    await seed(summaryPath('hid', 'pseudo-1'), summary(STUDENT_UID));
    await seed(summaryPath('hid', ANON_UID), summary(ANON_UID));
    await seed(receiptPath('hid', 'pseudo-1'), {
      studentUid: STUDENT_UID,
      submittedAt: 1000,
      attemptCount: 1,
    });
  });

  it('keeps the graded summary from the student who owns it', async () => {
    await assertFails(getDoc(doc(asStudent(), summaryPath('hid', 'pseudo-1'))));
    await assertFails(getDoc(doc(asAnon(), summaryPath('hid', ANON_UID))));
  });

  it('still shows the teacher every summary', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacher(), summaryPath('hid', 'pseudo-1')))
    );
    await assertFails(
      getDoc(doc(asTeacher(OTHER_TEACHER_UID), summaryPath('hid', 'pseudo-1')))
    );
  });

  it('lets the student read only their own receipt', async () => {
    await assertSucceeds(
      getDoc(doc(asStudent(), receiptPath('hid', 'pseudo-1')))
    );
    await assertFails(
      getDoc(doc(asStudent(OTHER_STUDENT_UID), receiptPath('hid', 'pseudo-1')))
    );
    await assertFails(getDoc(doc(asAnon(), receiptPath('hid', 'pseudo-1'))));
  });

  it('lets nobody write a receipt', async () => {
    const receipt = { studentUid: STUDENT_UID, attemptCount: 0 };
    await assertFails(
      setDoc(doc(asStudent(), receiptPath('hid', 'pseudo-1')), receipt)
    );
    await assertFails(
      setDoc(doc(asTeacher(), receiptPath('hid', 'pseudo-1')), receipt)
    );
  });
});

describe('Mini App with correct answers shown', () => {
  it('lets the student read their own summary, as before', async () => {
    await seed(sessionPath('shown'), sessionDoc({ showCorrectAnswers: true }));
    await seed(summaryPath('shown', 'pseudo-1'), summary(STUDENT_UID));
    await assertSucceeds(
      getDoc(doc(asStudent(), summaryPath('shown', 'pseudo-1')))
    );
    await assertFails(
      getDoc(
        doc(asStudent(OTHER_STUDENT_UID), summaryPath('shown', 'pseudo-1'))
      )
    );
  });

  it('keeps a v1 session readable even with the flag off', async () => {
    await seed(
      sessionPath('v1'),
      sessionDoc({ resultsVersion: 1, showCorrectAnswers: false })
    );
    await seed(summaryPath('v1', ANON_UID), {
      submittedAt: 1000,
      studentUid: ANON_UID,
      payload: { completed: true },
    });
    await assertSucceeds(getDoc(doc(asAnon(), summaryPath('v1', ANON_UID))));
  });

  it('keeps a hidden-answers session created without the marker readable', async () => {
    await seed(sessionPath('old'), sessionDoc({ showCorrectAnswers: false }));
    await seed(summaryPath('old', 'pseudo-1'), summary(STUDENT_UID));
    await assertSucceeds(
      getDoc(doc(asStudent(), summaryPath('old', 'pseudo-1')))
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), summaryPath('old', 'pseudo-1')))
    );
  });
});

describe('the summaryHidden marker', () => {
  it('is set at create and never added or removed after', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), sessionPath('new')),
        sessionDoc({ showCorrectAnswers: false, summaryHidden: true })
      )
    );
    await assertFails(
      setDoc(
        doc(asTeacher(), sessionPath('new')),
        sessionDoc({ showCorrectAnswers: false })
      )
    );
    await seed(sessionPath('plain'), sessionDoc({ showCorrectAnswers: false }));
    await assertFails(
      setDoc(
        doc(asTeacher(), sessionPath('plain')),
        sessionDoc({ showCorrectAnswers: false, summaryHidden: true })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), sessionPath('plain')),
        sessionDoc({ showCorrectAnswers: false, status: 'ended' })
      )
    );
  });
});
