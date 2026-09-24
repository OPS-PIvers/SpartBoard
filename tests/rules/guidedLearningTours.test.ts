// Firestore security-rules regression for `/building_guided_learning_tours/{setId}` (P7-3):
// staff read published tours, only admins publish, students and signed-out users read nothing.
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

const PROJECT_ID = 'spartboard-gl-tours';
const ADMIN_EMAIL = 'admin@example.com';
const TOURS = 'building_guided_learning_tours';

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
const asTeacher = () =>
  testEnv
    .authenticatedContext('teacher-uid', {
      email: 'teacher@example.com',
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

const snapshot = {
  set: { id: 's1', title: 'Boards', steps: [], imageUrls: [] },
  publishedAt: 1,
  publishedBy: 'admin-uid',
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
    await setDoc(doc(db, `${TOURS}/s1`), snapshot);
    await setDoc(doc(db, `${TOURS}/_meta`), { seededAt: 1 });
  });
});

describe('building_guided_learning_tours reads', () => {
  it('lets teachers and admins read a tour and the _meta marker', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), `${TOURS}/s1`)));
    await assertSucceeds(getDoc(doc(asTeacher(), `${TOURS}/_meta`)));
    await assertSucceeds(getDocs(collection(asTeacher(), TOURS)));
    await assertSucceeds(getDoc(doc(asAdmin(), `${TOURS}/s1`)));
  });

  it('denies anonymous and student-role students', async () => {
    await assertFails(getDoc(doc(asAnonStudent(), `${TOURS}/s1`)));
    await assertFails(getDoc(doc(asStudentRole(), `${TOURS}/s1`)));
    await assertFails(getDocs(collection(asStudentRole(), TOURS)));
  });

  it('denies signed-out reads', async () => {
    await assertFails(getDoc(doc(asSignedOut(), `${TOURS}/s1`)));
    await assertFails(getDocs(collection(asSignedOut(), TOURS)));
  });
});

describe('building_guided_learning_tours writes', () => {
  it('lets an admin publish, republish and remove a tour', async () => {
    const db = asAdmin();
    await assertSucceeds(setDoc(doc(db, `${TOURS}/s2`), snapshot));
    await assertSucceeds(
      setDoc(doc(db, `${TOURS}/s1`), { ...snapshot, publishedAt: 2 })
    );
    await assertSucceeds(deleteDoc(doc(db, `${TOURS}/s2`)));
  });

  it('denies every non-admin write', async () => {
    for (const db of [asTeacher(), asAnonStudent(), asStudentRole()]) {
      await assertFails(setDoc(doc(db, `${TOURS}/s2`), snapshot));
      await assertFails(
        setDoc(doc(db, `${TOURS}/s1`), { ...snapshot, publishedAt: 2 })
      );
      await assertFails(deleteDoc(doc(db, `${TOURS}/s1`)));
    }
    await assertFails(setDoc(doc(asSignedOut(), `${TOURS}/s2`), snapshot));
  });

  it('denies an unverified address posing as an admin', async () => {
    const db = testEnv
      .authenticatedContext('fake-uid', {
        email: ADMIN_EMAIL,
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();
    await assertFails(setDoc(doc(db, `${TOURS}/s2`), snapshot));
  });
});
