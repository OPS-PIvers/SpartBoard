// Firestore security-rules regression for the
// `/plcs/{plcId}/assignment_index/{assignmentId}` match block introduced
// with Phase 1 of the PLC Dashboard. The rules carry several subtle
// invariants that the dashboard's security model depends on:
//   - membership-gated reads
//   - no client writes: plcContentWriteV1 (Admin SDK) creates, edits and deletes entries
//
// A single CEL edit can silently break any of these. This file pins each
// one. Requires a running Firestore emulator — invoke via
// `pnpm run test:rules` (see vitest.rules.config.ts).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-plc-assignment-index';
const PLC_ID = 'plc-rules-test';
const ASSIGNMENT_ID = 'asn-rules-test';

const MEMBER_A_UID = 'member-a-uid';
const MEMBER_B_UID = 'member-b-uid';
const NON_MEMBER_UID = 'non-member-uid';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/canonical-sheet-id';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMemberA = () =>
  testEnv
    .authenticatedContext(MEMBER_A_UID, { email: 'member-a@example.com' })
    .firestore();

const asMemberB = () =>
  testEnv
    .authenticatedContext(MEMBER_B_UID, { email: 'member-b@example.com' })
    .firestore();

const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'random@example.com' })
    .firestore();

// Canonical valid entry payload. Tests start from this and mutate fields
// to exercise individual invariants — keeping the "happy path" template
// in one place avoids drift across cases.
const validEntry = (overrides: Record<string, unknown> = {}) => ({
  id: ASSIGNMENT_ID,
  kind: 'quiz',
  ownerUid: MEMBER_A_UID,
  ownerName: 'Member A',
  ownerEmail: 'member-a@example.com',
  title: 'My Quiz',
  sheetUrl: SHEET_URL,
  // Phase 3: required field. 'active' is the canonical create-time value;
  // pause/resume/deactivate flow through the update branch which checks
  // the `status in [...]` set.
  status: 'active',
  createdAt: 1000,
  ...overrides,
});

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
  // Seed a PLC with two members and a canonical sharedSheetUrl. Use the
  // privileged context so we don't have to satisfy the rule's create
  // branch in test setup.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_A_UID,
      memberUids: [MEMBER_A_UID, MEMBER_B_UID],
      memberEmails: {
        [MEMBER_A_UID]: 'member-a@example.com',
        [MEMBER_B_UID]: 'member-b@example.com',
      },
      sharedSheetUrl: SHEET_URL,
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assignment_index — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`
        ),
        validEntry()
      );
    });
  });

  it('a PLC member can read entries', async () => {
    await assertSucceeds(
      getDoc(
        doc(asMemberB(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`)
      )
    );
  });

  it('a non-member cannot read entries (membership gate)', async () => {
    // The dashboard renders the same list for every member; non-members
    // must not see the index at all. Without this gate, anyone with the
    // PLC id could enumerate every PLC-mode assignment a community has
    // run.
    await assertFails(
      getDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`)
      )
    );
  });
});

// ---------------------------------------------------------------------------
// writes: refused for clients (plcContentWriteV1 writes them)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assignment_index — client writes refused', () => {
  const entryRef = (db: ReturnType<typeof asMemberA>) =>
    doc(db, `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`);

  it('a member can no longer create their own entry', async () => {
    await assertFails(setDoc(entryRef(asMemberA()), validEntry()));
  });

  it('a non-member cannot create an entry either', async () => {
    await assertFails(setDoc(entryRef(asNonMember()), validEntry()));
  });

  describe('with an existing entry', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(
            ctx.firestore(),
            `plcs/${PLC_ID}/assignment_index/${ASSIGNMENT_ID}`
          ),
          validEntry()
        );
      });
    });

    it('the owner can no longer update their own entry', async () => {
      await assertFails(
        updateDoc(entryRef(asMemberA()), { title: 'Renamed Quiz' })
      );
      await assertFails(updateDoc(entryRef(asMemberA()), { sheetUrl: '' }));
    });

    it('another member cannot update or take over the entry', async () => {
      await assertFails(
        updateDoc(entryRef(asMemberB()), { ownerUid: MEMBER_B_UID })
      );
    });

    it('the owner can no longer delete their own entry', async () => {
      await assertFails(deleteDoc(entryRef(asMemberA())));
    });

    it('another member cannot delete the entry', async () => {
      await assertFails(deleteDoc(entryRef(asMemberB())));
    });
  });
});
