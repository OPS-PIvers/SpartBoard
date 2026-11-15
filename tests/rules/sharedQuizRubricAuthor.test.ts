// shared_quizzes / shared_rubrics: originalAuthor (the import dialog's trust signal) is immutable.
// Requires the Firestore emulator: pnpm run test:rules
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-share-author';
const AUTHOR_UID = 'author-uid';
const VICTIM_UID = 'victim-uid';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'shared_quizzes/q1'), {
      title: 'T',
      originalAuthor: AUTHOR_UID,
    });
    await setDoc(doc(db, 'shared_rubrics/r1'), {
      title: 'T',
      originalAuthor: AUTHOR_UID,
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const asAuthor = () =>
  testEnv
    .authenticatedContext(AUTHOR_UID, {
      email: 'a@orono.k12.mn.us',
      email_verified: true,
    })
    .firestore();

describe.each(['shared_quizzes/q1', 'shared_rubrics/r1'])(
  '%s update',
  (path) => {
    it('rejects rewriting originalAuthor', async () => {
      await assertFails(
        updateDoc(doc(asAuthor(), path), { originalAuthor: VICTIM_UID })
      );
    });
    it('still lets the author edit other fields', async () => {
      await assertSucceeds(updateDoc(doc(asAuthor(), path), { title: 'New' }));
    });
  }
);
