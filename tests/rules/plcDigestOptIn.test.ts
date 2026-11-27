// Firestore security rules regression coverage for the opt-in weekly-digest
// flag on the PLC root doc (`plcs/{plcId}.digestOptIn`, Decision 2.3, §5/§8).
//
// Pins that members read `digestOptIn` and that no client can toggle it any
// more (plcSettingsV1 writes the flag).
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  doc,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-digest-rules';
const PLC_ID = 'p1';

const LEAD_UID = 'lead-uid';
const MEMBER_UID = 'member-uid';
const NON_MEMBER_UID = 'non-member-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asLead = () =>
  testEnv
    .authenticatedContext(LEAD_UID, { email: 'lead@example.com' })
    .firestore();

const asMember = () =>
  testEnv
    .authenticatedContext(MEMBER_UID, { email: 'member@example.com' })
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
  // Seed a two-member PLC (lead + member). digestOptIn starts absent (⇒ off).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID, MEMBER_UID],
      memberEmails: {
        [LEAD_UID]: 'lead@example.com',
        [MEMBER_UID]: 'member@example.com',
      },
      members: {
        [LEAD_UID]: {
          uid: LEAD_UID,
          email: 'lead@example.com',
          role: 'lead',
          status: 'active',
          joinedAt: 1,
        },
        [MEMBER_UID]: {
          uid: MEMBER_UID,
          email: 'member@example.com',
          role: 'member',
          status: 'active',
          joinedAt: 1,
        },
      },
      features: {
        quizzes: true,
        videoActivities: true,
        notes: true,
        todos: true,
        sharedBoards: true,
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Reads stay open to members
// ---------------------------------------------------------------------------

describe('plcs/{plcId}.digestOptIn — read', () => {
  it('a member reads the flag; a non-member cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
      });
    });
    const snap = await assertSucceeds(
      getDoc(doc(asMember(), `plcs/${PLC_ID}`))
    );
    expect(snap.data()?.digestOptIn).toBe(true);
    await assertFails(getDoc(doc(asNonMember(), `plcs/${PLC_ID}`)));
  });
});

// ---------------------------------------------------------------------------
// Toggles are refused for clients (plcSettingsV1 writes the flag)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}.digestOptIn — client toggles refused', () => {
  it('the lead and a member can no longer turn the digest on or off', async () => {
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: false,
        updatedAt: 2,
      })
    );
  });

  it('a non-member cannot toggle the flag either', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('the toggle cannot carry another change (name, leadUid, features, members)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        name: 'Renamed',
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        leadUid: MEMBER_UID,
        updatedAt: 2,
      })
    );
  });
});
