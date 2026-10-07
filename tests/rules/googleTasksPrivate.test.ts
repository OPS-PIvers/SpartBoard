// Google Tasks sync state is server-only, so a teammate can't learn who connected (docs/plans/GOOGLE_TASKS_ACTION_ITEMS.md D11).
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-google-tasks';
const OWNER_UID = 'gt-owner';
const OTHER_UID = 'gt-other';
const STATE = `users/${OWNER_UID}/private/googleTasks`;
const MAP_DOC = `${STATE}/map/p1_note_n1_a`;
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
    const db = ctx.firestore();
    await setDoc(doc(db, STATE), { enabled: true, listId: 'L1' });
    await setDoc(doc(db, MAP_DOC), { taskId: 't1', lastKnownDone: false });
  });
});

describe('Google Tasks private state', () => {
  for (const [label, uid] of [
    ['the owner', OWNER_UID],
    ['a teammate', OTHER_UID],
  ] as const) {
    it(`${label} cannot read the connection or the task map`, async () => {
      const db = asTeacher(uid);
      await assertFails(getDoc(doc(db, STATE)));
      await assertFails(getDoc(doc(db, MAP_DOC)));
      await assertFails(getDocs(collection(db, `${STATE}/map`)));
    });

    it(`${label} cannot write or delete them`, async () => {
      const db = asTeacher(uid);
      await assertFails(setDoc(doc(db, STATE), { enabled: true }));
      await assertFails(setDoc(doc(db, MAP_DOC), { taskId: 'x' }));
      await assertFails(deleteDoc(doc(db, MAP_DOC)));
    });
  }
});
