// Firestore security-rules regression for the Schoology quiz import inbox (docs/plans/SCHOOLOGY_QUIZ_IMPORT.md Q8).
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
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-schoology-import';
const OWNER_UID = 'sgy-owner';
const OTHER_UID = 'sgy-other';
const ITEM = `users/${OWNER_UID}/schoology_import_inbox/testQuiz_8629405092`;
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
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
    await setDoc(doc(ctx.firestore(), ITEM), { questionCount: 1 });
  });
});

describe('Schoology import inbox', () => {
  it('lets only the owner read an item', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(OWNER_UID), ITEM)));
    await assertFails(getDoc(doc(asTeacher(OTHER_UID), ITEM)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), ITEM))
    );
  });

  it('lets only the owner delete an item', async () => {
    await assertFails(deleteDoc(doc(asTeacher(OTHER_UID), ITEM)));
    await assertSucceeds(deleteDoc(doc(asTeacher(OWNER_UID), ITEM)));
  });

  it('never lets a client create or change an item', async () => {
    const other = `users/${OWNER_UID}/schoology_import_inbox/assessment_1`;
    await assertFails(
      setDoc(doc(asTeacher(OWNER_UID), other), { questionCount: 1 })
    );
    await assertFails(
      updateDoc(doc(asTeacher(OWNER_UID), ITEM), { questionCount: 2 })
    );
  });
});
