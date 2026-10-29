// Firestore security-rules regression for Focus push subscriptions (functions/src/focus/studentEndpoints.ts): server-only.
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
import { FOCUS_PUSH_COLLECTION } from '@/utils/focus/contract';

const PROJECT_ID = 'spartboard-focus-push';
const ADMIN_EMAIL = 'boss@example.com';
const STUDENT_UID = 'student-pseudonym';
const PATH = `${FOCUS_PUSH_COLLECTION}/${STUDENT_UID}`;
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const signedIn = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const student = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      orgId: 'orono',
      classIds: ['class-1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const anonymous = () =>
  testEnv
    .authenticatedContext('anon-1', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'key', auth: 'auth' },
  updatedAt: 1,
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
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(db, PATH), SUBSCRIPTION);
  });
});

describe('focus_push_subscriptions', () => {
  const callers = {
    'the student it belongs to': () => student(),
    'an anonymous student': () => anonymous(),
    'a teacher': () => signedIn('t1', 'teacher@example.com'),
    'an admin': () => signedIn('a1', ADMIN_EMAIL),
  };

  for (const [who, db] of Object.entries(callers)) {
    it(`keeps ${who} from reading it`, async () => {
      await assertFails(getDoc(doc(db(), PATH)));
      await assertFails(getDocs(collection(db(), FOCUS_PUSH_COLLECTION)));
    });

    it(`keeps ${who} from writing or deleting it`, async () => {
      await assertFails(setDoc(doc(db(), PATH), SUBSCRIPTION));
      await assertFails(
        setDoc(doc(db(), `${FOCUS_PUSH_COLLECTION}/new-uid`), SUBSCRIPTION)
      );
      await assertFails(deleteDoc(doc(db(), PATH)));
    });
  }

  it('keeps signed-out callers out', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, PATH)));
    await assertFails(setDoc(doc(db, PATH), SUBSCRIPTION));
  });
});
