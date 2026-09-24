// Firestore security-rules regression for `/users/{uid}/gl_media_tombstones/{setId}`: owner-only.
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
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-gl-media-tombstones';
const OWNER = 'teacher-uid';
const PATH = `users/${OWNER}/gl_media_tombstones/set1`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asOwner = () =>
  testEnv
    .authenticatedContext(OWNER, {
      email: 'teacher@example.com',
      email_verified: true,
    })
    .firestore();
const asOtherTeacher = () =>
  testEnv
    .authenticatedContext('other-uid', {
      email: 'other@example.com',
      email_verified: true,
    })
    .firestore();
const asAnonStudent = () =>
  testEnv.authenticatedContext('anon-student-uid').firestore();
const asSignedOut = () => testEnv.unauthenticatedContext().firestore();

const tombstone = {
  setId: 'set1',
  storagePaths: [`users/${OWNER}/hotspot_images/1-a.webp`],
  driveFileIds: ['drive-1'],
  assignmentIds: ['a1'],
  createdAt: 1,
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
  await testEnv.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), PATH), tombstone)
  );
});

describe('gl_media_tombstones', () => {
  it('lets the owner read, list, write and delete', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), PATH)));
    await assertSucceeds(
      getDocs(collection(asOwner(), `users/${OWNER}/gl_media_tombstones`))
    );
    await assertSucceeds(
      setDoc(doc(asOwner(), `users/${OWNER}/gl_media_tombstones/set2`), {
        ...tombstone,
        setId: 'set2',
      })
    );
    await assertSucceeds(deleteDoc(doc(asOwner(), PATH)));
  });

  it('denies other teachers, students and signed-out callers', async () => {
    for (const db of [asOtherTeacher(), asAnonStudent(), asSignedOut()]) {
      await assertFails(getDoc(doc(db, PATH)));
      await assertFails(
        getDocs(collection(db, `users/${OWNER}/gl_media_tombstones`))
      );
      await assertFails(setDoc(doc(db, PATH), tombstone));
      await assertFails(deleteDoc(doc(db, PATH)));
    }
  });
});
