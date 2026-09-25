// Firestore security-rules regression for the Live Tours v2 unmapped-anchor queue:
// `/tour_anchor_queue` and `/tour_anchor_batches` are admin read and write only.
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

const PROJECT_ID = 'spartboard-tour-anchor-queue';
const ADMIN_EMAIL = 'admin@example.com';
const QUEUE = 'tour_anchor_queue';
const BATCHES = 'tour_anchor_batches';
const FP = 'a'.repeat(40);

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
const asSignedOut = () => testEnv.unauthenticatedContext().firestore();

const item = {
  fingerprint: FP,
  status: 'open',
  pathname: '/',
  ancestors: [{ tag: 'button' }],
  htmlExcerpt: '<button>Go</button>',
  occurrences: [{ setId: 's1', stepId: 'st1' }],
};
const batch = { setId: 's1', fingerprints: [FP], createdAt: 1 };

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
    await setDoc(doc(db, `${QUEUE}/${FP}`), item);
    await setDoc(doc(db, `${BATCHES}/b1`), batch);
  });
});

describe('tour_anchor_queue and tour_anchor_batches', () => {
  it('lets an admin read, write and delete both', async () => {
    const db = asAdmin();
    await assertSucceeds(getDoc(doc(db, `${QUEUE}/${FP}`)));
    await assertSucceeds(getDocs(collection(db, QUEUE)));
    await assertSucceeds(
      updateDoc(doc(db, `${QUEUE}/${FP}`), { status: 'rebound' })
    );
    await assertSucceeds(setDoc(doc(db, `${BATCHES}/b2`), batch));
    await assertSucceeds(getDoc(doc(db, `${BATCHES}/b1`)));
    await assertSucceeds(deleteDoc(doc(db, `${BATCHES}/b1`)));
  });

  it('denies teachers, students and signed-out users', async () => {
    for (const db of [asTeacher(), asAnonStudent(), asSignedOut()]) {
      await assertFails(getDoc(doc(db, `${QUEUE}/${FP}`)));
      await assertFails(getDocs(collection(db, QUEUE)));
      await assertFails(setDoc(doc(db, `${QUEUE}/${'b'.repeat(40)}`), item));
      await assertFails(
        updateDoc(doc(db, `${QUEUE}/${FP}`), { status: 'rebound' })
      );
      await assertFails(getDoc(doc(db, `${BATCHES}/b1`)));
      await assertFails(setDoc(doc(db, `${BATCHES}/b2`), batch));
    }
  });
});
