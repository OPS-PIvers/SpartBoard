// Rules for the Import block list doc (plan D16); S1 tests the reader failure log.
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-import-block-list';
const ADMIN_EMAIL = 'boss@example.com';
const TEACHER_EMAIL = 'teacher@example.com';
const BLOCK_LIST = 'admin_settings/import_send_block_list';
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
const asAdmin = () => signedIn('a1', ADMIN_EMAIL);
const asTeacher = () => signedIn('t1', TEACHER_EMAIL);

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
    await setDoc(doc(db, BLOCK_LIST), { patterns: ['*.sis.example/*'] });
  });
});

describe('admin_settings/import_send_block_list', () => {
  it('lets an admin read and save the list', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), BLOCK_LIST)));
    await assertSucceeds(
      setDoc(doc(asAdmin(), BLOCK_LIST), { patterns: [], updatedAt: 2 })
    );
  });

  it('keeps teachers from reading or changing the list', async () => {
    await assertFails(getDoc(doc(asTeacher(), BLOCK_LIST)));
    await assertFails(setDoc(doc(asTeacher(), BLOCK_LIST), { patterns: [] }));
    await assertFails(deleteDoc(doc(asTeacher(), BLOCK_LIST)));
  });
});
