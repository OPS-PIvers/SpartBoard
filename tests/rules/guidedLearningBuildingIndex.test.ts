// Firestore security-rules regression for `/building_guided_learning_index/{setId}`:
// readable by any signed-in user (same as the full building sets), writable by no client.
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
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-gl-building-index';
const ADMIN_EMAIL = 'admin@example.com';
const TEACHER_EMAIL = 'teacher@example.com';
const INDEX = 'building_guided_learning_index';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext('teacher-uid', {
      email: TEACHER_EMAIL,
      email_verified: true,
    })
    .firestore();
const asAnonStudent = () =>
  testEnv.authenticatedContext('anon-student-uid').firestore();
const asSignedOut = () => testEnv.unauthenticatedContext().firestore();

const entry = {
  id: 's1',
  title: 'Photosynthesis',
  description: null,
  stepCount: 3,
  mode: 'guided',
  thumbnail: '',
  createdAt: 1,
  updatedAt: 2,
  hasLiveTour: false,
  isHelpCenter: false,
  folderId: null,
  order: null,
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
    await setDoc(doc(db, `${INDEX}/s1`), entry);
  });
});

describe('building_guided_learning_index reads', () => {
  it('lets teachers, admins and signed-in students read and list', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), `${INDEX}/s1`)));
    await assertSucceeds(getDocs(collection(asTeacher(), INDEX)));
    await assertSucceeds(getDoc(doc(asAdmin(), `${INDEX}/s1`)));
    await assertSucceeds(getDoc(doc(asAnonStudent(), `${INDEX}/s1`)));
  });

  it('denies signed-out reads', async () => {
    await assertFails(getDoc(doc(asSignedOut(), `${INDEX}/s1`)));
    await assertFails(getDocs(collection(asSignedOut(), INDEX)));
  });
});

describe('building_guided_learning_index writes', () => {
  it('denies every client write, admins included', async () => {
    for (const db of [asAdmin(), asTeacher(), asAnonStudent()]) {
      await assertFails(setDoc(doc(db, `${INDEX}/s2`), entry));
      await assertFails(updateDoc(doc(db, `${INDEX}/s1`), { title: 'x' }));
      await assertFails(deleteDoc(doc(db, `${INDEX}/s1`)));
    }
    await assertFails(setDoc(doc(asSignedOut(), `${INDEX}/s2`), entry));
  });
});

describe('neighbouring rules trimmed to offset the index rule', () => {
  it('still denies client writes to admins and course links', async () => {
    const db = asAdmin();
    await assertFails(setDoc(doc(db, 'admins/new@example.com'), { a: 1 }));
    await assertFails(
      setDoc(doc(db, 'classroom_course_links/c1'), { teacherUid: 'x' })
    );
    await assertFails(
      setDoc(doc(db, 'lti_course_links/ctx1'), { teacherUid: 'x' })
    );
  });
});
