// classlink_class_members is Admin SDK only (functions/src/classlinkClassMembers.ts).
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-classlink-class-members';
const ADMIN_EMAIL = 'boss@example.com';
const LOG_PATH = 'classlink_class_members/CL1';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const signedIn = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

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
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(db, LOG_PATH), { members: { 'SID-A': 1 } });
  });
});

describe('classlink_class_members', () => {
  it('keeps admins and teachers from reading it', async () => {
    await assertFails(getDoc(doc(signedIn('a1', ADMIN_EMAIL), LOG_PATH)));
    await assertFails(
      getDoc(doc(signedIn('t1', 'teacher@example.com'), LOG_PATH))
    );
  });

  it('refuses client writes, even from an admin', async () => {
    await assertFails(
      setDoc(doc(signedIn('a1', ADMIN_EMAIL), LOG_PATH), { members: {} })
    );
  });
});
