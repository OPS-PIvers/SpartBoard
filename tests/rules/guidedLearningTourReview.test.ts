// Firestore security-rules regression for `/building_guided_learning/{setId}/review/{docId}` (LIVE_TOUR_CONSISTENT_START.md C9, C10):
// a live tour's notes for Claude and its last playtest name admins, so only admins read or write them.
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

const PROJECT_ID = 'spartboard-gl-tour-review';
const ADMIN_EMAIL = 'admin@example.com';
const REVIEW = 'building_guided_learning/s1/review/current';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asTeacher = (uid = 'teacher-uid') =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asAnonStudent = () =>
  testEnv
    .authenticatedContext('anon-student-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asStudentRole = () =>
  testEnv
    .authenticatedContext('sso-student-uid', {
      email: 'kid@example.com',
      email_verified: true,
      studentRole: true,
      classIds: ['class-1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asSignedOut = () => testEnv.unauthenticatedContext().firestore();

const review = {
  tourNote: { text: 'Shorter steps', by: ADMIN_EMAIL, at: 1 },
  stepNotes: { a: { text: 'Wrong button', by: ADMIN_EMAIL, at: 1 } },
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
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { addedAt: 1 });
    await setDoc(doc(db, REVIEW), review);
  });
});

describe('live tour review doc', () => {
  it('lets an admin read and write it', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), REVIEW)));
    await assertSucceeds(setDoc(doc(asAdmin(), REVIEW), review));
    await assertSucceeds(deleteDoc(doc(asAdmin(), REVIEW)));
  });

  it('keeps teachers, students and signed-out users out', async () => {
    for (const db of [
      asTeacher(),
      asAnonStudent(),
      asStudentRole(),
      asSignedOut(),
    ]) {
      await assertFails(getDoc(doc(db, REVIEW)));
      await assertFails(
        getDocs(collection(db, 'building_guided_learning/s1/review'))
      );
      await assertFails(setDoc(doc(db, REVIEW), review));
    }
  });
});
