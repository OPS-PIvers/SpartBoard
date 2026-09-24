// Firestore security-rules regression for `/building_guided_learning_tours/{setId}/runs/{uid}` (P7-6):
// each teacher writes only their own run doc and cannot read any; admins read; students and signed-out users get nothing.
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

const PROJECT_ID = 'spartboard-gl-tour-runs';
const ADMIN_EMAIL = 'admin@example.com';
const RUNS = 'building_guided_learning_tours/s1/runs';

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

const run = {
  v: 9,
  startedAt: 1,
  furthest: 2,
  done: false,
  exit: 2,
  misses: ['step-a'],
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
    await setDoc(doc(db, `${RUNS}/other-uid`), run);
    await setDoc(doc(db, `${RUNS}/teacher-uid`), run);
  });
});

describe('tour runs reads', () => {
  it('lets an admin read and list runs', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), `${RUNS}/other-uid`)));
    await assertSucceeds(getDocs(collection(asAdmin(), RUNS)));
  });

  it('keeps runs write-only for teachers, their own included', async () => {
    await assertFails(getDoc(doc(asTeacher(), `${RUNS}/teacher-uid`)));
    await assertFails(getDoc(doc(asTeacher(), `${RUNS}/other-uid`)));
    await assertFails(getDocs(collection(asTeacher(), RUNS)));
  });

  it('denies students and signed-out users', async () => {
    for (const db of [asAnonStudent(), asStudentRole(), asSignedOut()]) {
      await assertFails(getDoc(doc(db, `${RUNS}/other-uid`)));
      await assertFails(getDocs(collection(db, RUNS)));
    }
  });
});

describe('tour runs writes', () => {
  it('lets a teacher create and overwrite their own run', async () => {
    const db = asTeacher('new-uid');
    await assertSucceeds(setDoc(doc(db, `${RUNS}/new-uid`), run));
    await assertSucceeds(
      setDoc(doc(db, `${RUNS}/new-uid`), {
        v: 9,
        startedAt: 1,
        furthest: 3,
        done: true,
        misses: [],
      })
    );
  });

  it("denies writing another teacher's run and deleting runs", async () => {
    await assertFails(setDoc(doc(asTeacher(), `${RUNS}/other-uid`), run));
    await assertFails(deleteDoc(doc(asTeacher(), `${RUNS}/teacher-uid`)));
  });

  it('keeps the doc bounded', async () => {
    const db = asTeacher();
    const ref = doc(db, `${RUNS}/teacher-uid`);
    await assertFails(setDoc(ref, { ...run, note: 'extra' }));
    await assertFails(setDoc(ref, { ...run, furthest: '2' }));
    await assertFails(setDoc(ref, { ...run, furthest: 501 }));
    await assertFails(setDoc(ref, { ...run, furthest: -1 }));
    await assertFails(setDoc(ref, { ...run, v: '9' }));
    await assertFails(setDoc(ref, { ...run, startedAt: 'now' }));
    await assertFails(setDoc(ref, { ...run, done: 'yes' }));
    await assertFails(setDoc(ref, { ...run, exit: '2' }));
    await assertFails(setDoc(ref, { ...run, misses: 'step-a' }));
    await assertSucceeds(setDoc(ref, { ...run, furthest: 500 }));
    await assertFails(
      setDoc(ref, {
        ...run,
        misses: Array.from({ length: 51 }, (_, i) => `s${i}`),
      })
    );
    const { misses: _misses, ...noMisses } = run;
    await assertFails(setDoc(ref, noMisses));
  });

  it('denies students and signed-out users', async () => {
    await assertFails(
      setDoc(doc(asAnonStudent(), `${RUNS}/anon-student-uid`), run)
    );
    await assertFails(
      setDoc(doc(asStudentRole(), `${RUNS}/sso-student-uid`), run)
    );
    await assertFails(setDoc(doc(asSignedOut(), `${RUNS}/anyone`), run));
  });

  it('lets an admin log their own run, like any teacher', async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), `${RUNS}/admin-uid`), run));
  });
});
