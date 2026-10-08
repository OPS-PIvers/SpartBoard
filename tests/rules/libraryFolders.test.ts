// Firestore security-rules regression for personal library folders (docs/plans/LIBRARY_FOLDERS.md).
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-library-folders';
const OWNER_UID = 'folder-owner';
const OTHER_UID = 'folder-other';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const FOLDER_COLLECTIONS = [
  'quiz_folders',
  'question_bank_folders',
  'video_activity_folders',
  'guided_learning_folders',
  'miniapp_folders',
  'flashcard_folders',
  'projects_folders',
];

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const folder = (overrides: Record<string, unknown> = {}) => ({
  name: 'Unit 3',
  parentId: null,
  order: 0,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

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
});

describe.each(FOLDER_COLLECTIONS)('users/{uid}/%s colour', (collection) => {
  const path = `users/${OWNER_UID}/${collection}/f1`;

  it('the owner can create, read, recolour, clear and delete a coloured folder', async () => {
    const db = asTeacher(OWNER_UID);
    await assertSucceeds(setDoc(doc(db, path), folder({ color: 'green' })));
    const snap = await assertSucceeds(getDoc(doc(db, path)));
    expect(snap.data()?.color).toBe('green');
    await assertSucceeds(
      updateDoc(doc(db, path), { color: 'pink', updatedAt: 2000 })
    );
    await assertSucceeds(
      updateDoc(doc(db, path), { color: deleteField(), updatedAt: 3000 })
    );
    await assertSucceeds(deleteDoc(doc(db, path)));
  });

  it('another teacher can neither read nor recolour the folder', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), folder({ color: 'red' }));
    });
    const db = asTeacher(OTHER_UID);
    await assertFails(getDoc(doc(db, path)));
    await assertFails(updateDoc(doc(db, path), { color: 'blue' }));
    await assertFails(deleteDoc(doc(db, path)));
  });
});
