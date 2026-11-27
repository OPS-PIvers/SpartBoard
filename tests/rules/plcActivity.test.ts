// Firestore security rules regression coverage for `plcs/{plcId}/activity`.
// Pins the Wave-2 activity-log invariants (Decision 2.2, §3.4):
//   - Any current PLC member can read the activity feed.
//   - Clients may NEVER create, update or delete an event (server-only: plcTeamItemsV1 writes, GC deletes).
//   - Non-members cannot read.
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

const PROJECT_ID = 'spartboard-plc-activity-rules';
const PLC_ID = 'p1';
const EVENT_ID = 'e1';

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

const validEvent = (overrides: Record<string, unknown> = {}) => ({
  id: EVENT_ID,
  type: 'note_created',
  actorUid: MEMBER_UID,
  actorName: 'Member Teacher',
  targetType: 'note',
  targetId: 'n1',
  targetTitle: 'Meeting notes',
  createdAt: 1000,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/activity — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent()
      );
    });
  });

  it('a member can read activity', async () => {
    await assertSucceeds(
      getDoc(doc(asMember2(), `plcs/${PLC_ID}/activity/${EVENT_ID}`))
    );
  });

  it('a non-member cannot read activity (membership gate)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`))
    );
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/activity — create refused (plcTeamItemsV1 writes events)', () => {
  it('a member can no longer create an event for their own action', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent()
      )
    );
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent({ createdAt: serverTimestamp() })
      )
    );
  });

  it('a non-member cannot create an event either', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent({ actorUid: NON_MEMBER_UID })
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Update / delete — never allowed for clients (server-only GC)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/activity — immutable (no client update/delete)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent()
      );
    });
  });

  it('a member cannot update an event', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`), {
        actorName: 'Renamed',
      })
    );
  });

  it('a member cannot delete an event', async () => {
    await assertFails(
      deleteDoc(doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`))
    );
  });
});
