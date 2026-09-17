// Firestore security-rules regression for Flashcards PR 1.
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
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-flashcards-library';
const OWNER_UID = 'flashcard-owner';
const OTHER_UID = 'flashcard-other';
const STUDENT_UID = 'flashcard-student';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: 'student@example.com',
      studentRole: true,
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
});

describe('teacher-owned flashcard collections', () => {
  it.each([
    'flashcard_sets/set-1',
    'flashcard_folders/folder-1',
    'flashcard_assignments/assignment-1',
  ])('allows the owner and denies another teacher for %s', async (suffix) => {
    const path = `users/${OWNER_UID}/${suffix}`;
    await assertSucceeds(setDoc(doc(asTeacher(OWNER_UID), path), { ok: true }));
    await assertSucceeds(getDoc(doc(asTeacher(OWNER_UID), path)));
    await assertFails(getDoc(doc(asTeacher(OTHER_UID), path)));
    await assertFails(setDoc(doc(asTeacher(OTHER_UID), path), { ok: true }));
  });

  it('denies a student-role user even under their own uid', async () => {
    const path = `users/${STUDENT_UID}/flashcard_sets/set-1`;
    await assertFails(setDoc(doc(asStudent(), path), { ok: true }));
    await assertFails(getDoc(doc(asStudent(), path)));
  });
});

describe('public flashcard snapshots', () => {
  const snapshot = {
    teacherUid: OWNER_UID,
    setId: 'set-1',
    title: 'Spanish basics',
    description: '',
    termLanguage: 'es-US',
    definitionLanguage: 'en-US',
    cards: [{ id: 'card-1', term: 'hola', definition: 'hello' }],
    updatedAt: 1,
  };

  it('allows an unauthenticated get but denies collection listing', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(OWNER_UID), 'public_flashcard_sets/share-1'),
        snapshot
      )
    );
    const publicDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      getDoc(doc(publicDb, 'public_flashcard_sets/share-1'))
    );
    await assertFails(getDocs(collection(publicDb, 'public_flashcard_sets')));
  });

  it('limits mutation to the snapshot owner', async () => {
    const path = 'public_flashcard_sets/share-1';
    await assertSucceeds(setDoc(doc(asTeacher(OWNER_UID), path), snapshot));
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_UID), path), {
        title: 'Hijacked',
        teacherUid: OTHER_UID,
      })
    );
    await assertFails(deleteDoc(doc(asTeacher(OTHER_UID), path)));
    await assertSucceeds(deleteDoc(doc(asTeacher(OWNER_UID), path)));
  });

  it('rejects student publishers and unexpected fields', async () => {
    await assertFails(
      setDoc(doc(asStudent(), 'public_flashcard_sets/student-share'), {
        ...snapshot,
        teacherUid: STUDENT_UID,
      })
    );
    await assertFails(
      setDoc(doc(asTeacher(OWNER_UID), 'public_flashcard_sets/bad-share'), {
        ...snapshot,
        secret: 'not allowed',
      })
    );
  });
});
