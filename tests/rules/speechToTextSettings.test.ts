// Firestore security-rules regression for the paid Speech to text extras:
//   - /admin_settings/speech_to_text: any signed-in read, admin-only write
//   - /ai_usage/global_speech_to_text_{YYYY-MM}: admin read, no client write
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
import { setDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-speech-to-text';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_UID = 'admin-uid';
const TEACHER_UID = 'teacher-uid';
const STUDENT_UID = 'student-uid';
const SETTINGS_PATH = 'admin_settings/speech_to_text';
const USAGE_PATH = 'ai_usage/global_speech_to_text_2026-11';

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
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@example.com',
      email_verified: true,
    })
    .firestore();

const asStudent = () =>
  testEnv.authenticatedContext(STUDENT_UID, { studentRole: true }).firestore();

const settingsDoc = {
  engine: 'hybrid',
  tidyUp: true,
  monthlyCapSeconds: 60000,
  monthlyCapTidyCalls: 5000,
  updatedAt: 1,
  updatedBy: ADMIN_EMAIL,
};

const usageDoc = { seconds: 120, clips: 9, tidyCalls: 2 };

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
    await setDoc(doc(ctx.firestore(), SETTINGS_PATH), settingsDoc);
    await setDoc(doc(ctx.firestore(), USAGE_PATH), usageDoc);
  });
});

describe('admin_settings/speech_to_text', () => {
  it('a signed-in student and a teacher read it; signed-out cannot', async () => {
    await assertSucceeds(getDoc(doc(asStudent(), SETTINGS_PATH)));
    await assertSucceeds(getDoc(doc(asTeacher(), SETTINGS_PATH)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), SETTINGS_PATH))
    );
  });

  it('admins write it; students and teachers cannot', async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), SETTINGS_PATH), settingsDoc));
    await assertFails(setDoc(doc(asStudent(), SETTINGS_PATH), settingsDoc));
    await assertFails(setDoc(doc(asTeacher(), SETTINGS_PATH), settingsDoc));
  });
});

describe('ai_usage/global_speech_to_text_*', () => {
  it('admins read it; students and teachers cannot', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), USAGE_PATH)));
    await assertFails(getDoc(doc(asStudent(), USAGE_PATH)));
    await assertFails(getDoc(doc(asTeacher(), USAGE_PATH)));
  });

  it('no client writes it, admins included', async () => {
    await assertFails(setDoc(doc(asAdmin(), USAGE_PATH), usageDoc));
    await assertFails(setDoc(doc(asStudent(), USAGE_PATH), usageDoc));
    await assertFails(setDoc(doc(asTeacher(), USAGE_PATH), usageDoc));
  });
});
