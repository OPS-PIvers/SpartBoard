// Firestore security rules regression coverage for `plcs/{plcId}/activity`.
// Pins the Wave-2 activity-log invariants (Decision 2.2, §3.4):
//   - Any current PLC member can read the activity feed.
//   - A member may CREATE an event, but only one whose `actorUid` is their own.
//   - `id` is pinned to the doc id; `type` is pinned to the closed union.
//   - Schema is locked; `createdAt` dual-accepts int || timestamp.
//   - Clients may NEVER update or delete an event (server-only GC, Wave 4).
//   - Non-members cannot read or create.
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

describe('plcs/{plcId}/activity — create', () => {
  it('a member can create an event for their own action', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent()
      )
    );
  });

  it('accepts serverTimestamp() createdAt (dual-accept)', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent({ createdAt: serverTimestamp() })
      )
    );
  });

  it('accepts an event with no optional target fields', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`), {
        id: EVENT_ID,
        type: 'member_joined',
        actorUid: MEMBER_UID,
        actorName: 'Member Teacher',
        createdAt: 1000,
      })
    );
  });

  it('rejects an event whose actorUid is not the caller (no forging)', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent({ actorUid: MEMBER2_UID })
      )
    );
  });

  it('rejects an event whose id does not match the doc id', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent({ id: 'different' })
      )
    );
  });

  it('rejects an event with a type outside the closed union', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`),
        validEvent({ type: 'made_up_type' })
      )
    );
  });

  it('rejects an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/activity/${EVENT_ID}`), {
        ...validEvent(),
        unexpected: 'x',
      })
    );
  });

  it('a non-member cannot create an event', async () => {
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
