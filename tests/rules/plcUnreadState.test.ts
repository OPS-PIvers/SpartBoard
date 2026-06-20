// Firestore security rules regression coverage for
// `/users/{uid}/plc_state/{plcId}` (Decision 2.2, §3.4): the per-user private
// unread cursor for a PLC's activity feed.
//   - Strictly owner-only read/create/update/delete.
//   - Schema locked to a single `lastSeenAt` field (int || timestamp).
//   - Another user cannot read or write someone else's cursor.
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
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-state-rules';
const PLC_ID = 'p1';

const OWNER_UID = 'owner-uid';
const OTHER_UID = 'other-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asOwner = () =>
  testEnv
    .authenticatedContext(OWNER_UID, { email: 'owner@example.com' })
    .firestore();

const asOther = () =>
  testEnv
    .authenticatedContext(OTHER_UID, { email: 'other@example.com' })
    .firestore();

const STATE_PATH = `users/${OWNER_UID}/plc_state/${PLC_ID}`;

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

describe('users/{uid}/plc_state/{plcId} — owner-only cursor', () => {
  it('owner can create their cursor with serverTimestamp() lastSeenAt', async () => {
    await assertSucceeds(
      setDoc(doc(asOwner(), STATE_PATH), { lastSeenAt: serverTimestamp() })
    );
  });

  it('owner can create their cursor with an int lastSeenAt (legacy)', async () => {
    await assertSucceeds(
      setDoc(doc(asOwner(), STATE_PATH), { lastSeenAt: 1000 })
    );
  });

  it('owner can update lastSeenAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), STATE_PATH), { lastSeenAt: 1 });
    });
    await assertSucceeds(
      updateDoc(doc(asOwner(), STATE_PATH), { lastSeenAt: serverTimestamp() })
    );
  });

  it('owner can read their own cursor', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), STATE_PATH), { lastSeenAt: 1 });
    });
    await assertSucceeds(getDoc(doc(asOwner(), STATE_PATH)));
  });

  it('owner can delete their own cursor', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), STATE_PATH), { lastSeenAt: 1 });
    });
    await assertSucceeds(deleteDoc(doc(asOwner(), STATE_PATH)));
  });

  it('rejects an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asOwner(), STATE_PATH), { lastSeenAt: 1000, extra: true })
    );
  });

  it('rejects a non-int / non-timestamp lastSeenAt', async () => {
    await assertFails(
      setDoc(doc(asOwner(), STATE_PATH), { lastSeenAt: 'recently' })
    );
  });

  it('a different user cannot read the owner cursor', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), STATE_PATH), { lastSeenAt: 1 });
    });
    await assertFails(getDoc(doc(asOther(), STATE_PATH)));
  });

  it('a different user cannot write the owner cursor', async () => {
    await assertFails(
      setDoc(doc(asOther(), STATE_PATH), { lastSeenAt: serverTimestamp() })
    );
  });
});
