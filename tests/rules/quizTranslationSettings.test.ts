// Firestore security-rules regression for quiz translation (plan §7, §11 PR2):
//   - /admin_settings/quiz_translation: any authed read, admin-only write
//   - /admin_settings/quiz_read_aloud stays admin-only (never widened)
//   - a student may not write `backTranslations` onto their own response doc
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-translation';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_UID = 'admin-uid';
const TEACHER_UID = 'teacher-uid';
const STUDENT_UID = 'student-uid';
const SESSION_ID = 'session-translation-rules';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, { email: 'teacher@example.com' })
    .firestore();

const asStudent = () =>
  testEnv.authenticatedContext(STUDENT_UID, {}).firestore();

const settingsDoc = {
  enabledLanguages: ['es', 'so'],
  monthlyCapUnits: 2000,
  monthlyCapOutputTokens: 8000000,
  updatedAt: 1,
  updatedBy: ADMIN_EMAIL,
};

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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {});
  });
});

describe('admin_settings/quiz_translation', () => {
  it('admins write; teachers cannot', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), 'admin_settings/quiz_translation'), settingsDoc)
    );
    await assertFails(
      setDoc(doc(asTeacher(), 'admin_settings/quiz_translation'), settingsDoc)
    );
  });

  it('any authed user reads it; anonymous cannot; read-aloud config stays closed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'admin_settings/quiz_translation'),
        settingsDoc
      );
      await setDoc(doc(ctx.firestore(), 'admin_settings/quiz_read_aloud'), {
        neural2MonthlyCapChars: 1,
      });
    });
    await assertSucceeds(
      getDoc(doc(asTeacher(), 'admin_settings/quiz_translation'))
    );
    await assertFails(
      getDoc(doc(asTeacher(), 'admin_settings/quiz_read_aloud'))
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'admin_settings/quiz_translation'
        )
      )
    );
  });
});

describe('quiz response backTranslations', () => {
  const responsePath = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        pin: '1234',
        totalQuestions: 1,
        publicQuestions: [{ id: 'q1', type: 'free-response', text: 'Explain' }],
        createdAt: Date.now(),
      });
      await setDoc(doc(ctx.firestore(), responsePath), {
        studentUid: STUDENT_UID,
        studentName: 'Student',
        pin: '1234',
        answers: {},
        status: 'in-progress',
        joinedAt: Date.now(),
      });
    });
  });

  // Positive controls: without these the assertFails below could pass vacuously.
  it('a student can still write their own answers', async () => {
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), { answers: { q1: 'hola' } })
    );
  });

  it('the teacher-owner can write a back-translation', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), responsePath), {
        backTranslations: {
          q1: { text: 'hello', locale: 'so', model: 'm', at: 1 },
        },
      })
    );
  });

  it('a student cannot write a back-translation onto their own response', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), {
        backTranslations: {
          abc: { text: 'forged', locale: 'so', model: 'x', at: 1 },
        },
      })
    );
  });
});
