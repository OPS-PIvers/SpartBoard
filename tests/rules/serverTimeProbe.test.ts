// Firestore security-rules tests for `/server_time_probe/{uid}` (M17 §5 C2 /
// utils/serverTime.ts). Requires a running Firestore emulator; invoke via
// `pnpm run test:rules`.
//
// Contract: any signed-in user may read/write only their own scratch doc —
// used solely to derive a clock-skew offset from a serverTimestamp()
// round-trip. No cross-user access, teacher or student.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, serverTimestamp, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-server-time-probe-test';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asUser = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

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

describe('/server_time_probe/{uid}', () => {
  it('lets a user write their own probe doc', async () => {
    const db = asUser('user-a');
    await assertSucceeds(
      setDoc(doc(db, 'server_time_probe', 'user-a'), { at: serverTimestamp() })
    );
  });

  it('lets a user read their own probe doc', async () => {
    const db = asUser('user-a');
    await setDoc(doc(db, 'server_time_probe', 'user-a'), {
      at: serverTimestamp(),
    });
    await assertSucceeds(getDoc(doc(db, 'server_time_probe', 'user-a')));
  });

  it("rejects writing another user's probe doc", async () => {
    const db = asUser('user-a');
    await assertFails(
      setDoc(doc(db, 'server_time_probe', 'user-b'), { at: serverTimestamp() })
    );
  });

  it("rejects reading another user's probe doc", async () => {
    const owner = asUser('user-b');
    await setDoc(doc(owner, 'server_time_probe', 'user-b'), {
      at: serverTimestamp(),
    });
    const db = asUser('user-a');
    await assertFails(getDoc(doc(db, 'server_time_probe', 'user-b')));
  });

  it('rejects an unauthenticated write', async () => {
    const db = asUnauth();
    await assertFails(
      setDoc(doc(db, 'server_time_probe', 'user-a'), { at: serverTimestamp() })
    );
  });
});
