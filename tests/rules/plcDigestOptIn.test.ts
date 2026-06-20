// Firestore security rules regression coverage for the opt-in weekly-digest
// flag on the PLC root doc (`plcs/{plcId}.digestOptIn`, Decision 2.3, §5/§8).
//
// Pins the `isUpdatingPlcDigestOptIn()` rules branch:
//   - ANY current member may toggle `digestOptIn` (true/false) — it's shared
//     opt-in config, not lead-only (mirrors `isUpdatingPlcFeatures`).
//   - The diff is closed to exactly `digestOptIn` + `updatedAt`: a member
//     CANNOT smuggle other field changes (name / leadUid / members /
//     memberUids / features / sharedSheetUrl) through this branch.
//   - `digestOptIn` must be a boolean.
//   - A non-member cannot toggle it.
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
import { setDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

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
// Allowed toggles
// ---------------------------------------------------------------------------

describe('plcs/{plcId}.digestOptIn — any member can toggle', () => {
  it('the lead can turn the digest ON', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('a non-lead member can turn the digest ON', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('a member can turn the digest OFF (false is a valid boolean)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: false,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('accepts a legacy numeric updatedAt (dual-accept during rollout)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Rejected — non-member
// ---------------------------------------------------------------------------

describe('plcs/{plcId}.digestOptIn — non-member denied', () => {
  it('a non-member cannot toggle the flag', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        updatedAt: serverTimestamp(),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Rejected — field smuggling / bad value
// ---------------------------------------------------------------------------

describe('plcs/{plcId}.digestOptIn — diff is closed (no smuggling)', () => {
  it('cannot rename the PLC alongside the toggle', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        name: 'Hijacked',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('cannot seize leadUid alongside the toggle', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        leadUid: MEMBER_UID,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('cannot change the features map alongside the toggle', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        features: {
          quizzes: false,
          videoActivities: true,
          notes: true,
          todos: true,
          sharedBoards: true,
        },
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('cannot evict a teammate from memberUids alongside the toggle', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        memberUids: [MEMBER_UID],
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('cannot set sharedSheetUrl alongside the toggle', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: true,
        sharedSheetUrl: 'https://docs.google.com/spreadsheets/d/abc',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('rejects a non-boolean digestOptIn value', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        digestOptIn: 'yes',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('rejects an updatedAt-only ping that does not touch digestOptIn', async () => {
    // hasAny(['digestOptIn']) guards this — an updatedAt-only write must not
    // pass through this branch (it would let a member reset mtime silently).
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        updatedAt: serverTimestamp(),
      })
    );
  });
});
