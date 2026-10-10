// Firestore security-rules regression for the AI call log (functions/src/aiRouter.ts).
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
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-ai-call-log';
const ADMIN_EMAIL = 'boss@example.com';
const LOG_PATH = 'ai_call_log/2026-10-10__quiz__gemini-3_5-flash-lite';
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
    await setDoc(doc(db, LOG_PATH), { calls: 3 });
  });
});

describe('ai_call_log', () => {
  it('lets an admin read the call log', async () => {
    await assertSucceeds(getDoc(doc(signedIn('a1', ADMIN_EMAIL), LOG_PATH)));
  });

  it('keeps teachers out', async () => {
    await assertFails(
      getDoc(doc(signedIn('t1', 'teacher@example.com'), LOG_PATH))
    );
  });

  it('refuses client writes, even from an admin', async () => {
    await assertFails(
      setDoc(doc(signedIn('a1', ADMIN_EMAIL), LOG_PATH), { calls: 0 })
    );
  });
});
