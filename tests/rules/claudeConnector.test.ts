// Firestore security-rules regression for the Claude connector (docs/plans/CLAUDE_CONNECTOR.md).
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
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-claude-connector';
const OWNER_UID = 'cc-owner';
const OTHER_UID = 'cc-other';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
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
    await setDoc(doc(db, `users/${OWNER_UID}/mcp_grants/g1`), {
      revokedAt: null,
    });
    await setDoc(doc(db, `users/${OWNER_UID}/claude_activity/a1`), { at: 1 });
    await setDoc(doc(db, `users/${OWNER_UID}/claude_revisions/r1`), {
      createdAt: 1,
    });
    await setDoc(doc(db, `users/${OWNER_UID}/claude_usage/2026-09-27`), {
      writes: 1,
    });
    await setDoc(doc(db, 'mcp_oauth/keys'), { hs256: 'secret' });
    await setDoc(doc(db, 'mcp_oauth_codes/c1'), { uid: OWNER_UID });
  });
});

describe('Claude connector records', () => {
  it.each(['mcp_grants/g1', 'claude_activity/a1', 'claude_revisions/r1'])(
    'lets only the owner read %s and nobody write it',
    async (suffix) => {
      const path = `users/${OWNER_UID}/${suffix}`;
      await assertSucceeds(getDoc(doc(asTeacher(OWNER_UID), path)));
      await assertFails(getDoc(doc(asTeacher(OTHER_UID), path)));
      await assertFails(
        setDoc(doc(asTeacher(OWNER_UID), path), { revokedAt: null })
      );
      await assertFails(deleteDoc(doc(asTeacher(OWNER_UID), path)));
    }
  );

  it.each([
    `users/${OWNER_UID}/claude_usage/2026-09-27`,
    'mcp_oauth/keys',
    'mcp_oauth_codes/c1',
  ])('keeps %s server-only', async (path) => {
    await assertFails(getDoc(doc(asTeacher(OWNER_UID), path)));
    await assertFails(setDoc(doc(asTeacher(OWNER_UID), path), { x: 1 }));
  });
});
