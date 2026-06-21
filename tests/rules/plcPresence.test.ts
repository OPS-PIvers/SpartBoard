// Firestore security rules regression coverage for `plcs/{plcId}/presence`.
// Pins the Wave-2 presence invariants (Decision 2.1, §3.3):
//   - Any current PLC member can read every presence doc ("who's here").
//   - A member may write ONLY the doc keyed to their own uid (no spoofing).
//   - On write: `uid` must equal the caller, schema is locked, `lastActiveAt`
//     dual-accepts int || timestamp (serverTimestamp rollout).
//   - Non-members cannot read or write.
//   - A member may delete their own presence doc.
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

const PROJECT_ID = 'spartboard-plc-presence-rules';
const PLC_ID = 'p1';

const MEMBER_UID = 'member-uid';
const MEMBER2_UID = 'member2-uid';
const NON_MEMBER_UID = 'non-member-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMember = () =>
  testEnv
    .authenticatedContext(MEMBER_UID, { email: 'member@example.com' })
    .firestore();

const asMember2 = () =>
  testEnv
    .authenticatedContext(MEMBER2_UID, { email: 'member2@example.com' })
    .firestore();

const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'nonmember@example.com' })
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
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID, MEMBER2_UID],
      memberEmails: {
        [MEMBER_UID]: 'member@example.com',
        [MEMBER2_UID]: 'member2@example.com',
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

const validPresence = (
  uid: string,
  overrides: Record<string, unknown> = {}
) => ({
  uid,
  displayName: 'Member Teacher',
  section: 'home',
  lastActiveAt: 1000,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/presence — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`),
        validPresence(MEMBER_UID)
      );
    });
  });

  it('a member can read another member presence doc', async () => {
    await assertSucceeds(
      getDoc(doc(asMember2(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`))
    );
  });

  it('a non-member cannot read presence (membership gate)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`))
    );
  });
});

// ---------------------------------------------------------------------------
// Write (create / update / heartbeat)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/presence — write', () => {
  it('a member can write their own presence doc', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`),
        validPresence(MEMBER_UID)
      )
    );
  });

  it('accepts serverTimestamp() for lastActiveAt (dual-accept)', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`),
        validPresence(MEMBER_UID, { lastActiveAt: serverTimestamp() })
      )
    );
  });

  it('a member cannot write a teammate presence doc (no spoofing)', async () => {
    await assertFails(
      setDoc(
        doc(asMember2(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`),
        validPresence(MEMBER_UID)
      )
    );
  });

  it('rejects a presence doc whose uid field mismatches the caller', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`),
        validPresence(MEMBER_UID, { uid: MEMBER2_UID })
      )
    );
  });

  it('a non-member cannot write presence', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/presence/${NON_MEMBER_UID}`),
        validPresence(NON_MEMBER_UID)
      )
    );
  });

  it('rejects an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`), {
        ...validPresence(MEMBER_UID),
        unexpected: 'x',
      })
    );
  });

  it('rejects a non-int / non-timestamp lastActiveAt', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`),
        validPresence(MEMBER_UID, { lastActiveAt: 'now' })
      )
    );
  });

  it('a member can heartbeat (update) their own presence', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`),
        validPresence(MEMBER_UID)
      );
    });
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`), {
        section: 'meeting',
        lastActiveAt: serverTimestamp(),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/presence — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`),
        validPresence(MEMBER_UID)
      );
    });
  });

  it('a member can delete their own presence doc', async () => {
    await assertSucceeds(
      deleteDoc(doc(asMember(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`))
    );
  });

  it('a member cannot delete a teammate presence doc', async () => {
    await assertFails(
      deleteDoc(doc(asMember2(), `plcs/${PLC_ID}/presence/${MEMBER_UID}`))
    );
  });
});
