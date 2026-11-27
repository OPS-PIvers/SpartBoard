// Firestore security-rules coverage for the PLC note OPTIMISTIC VERSION
// PRECONDITION (Decision 2.4, §3.8) and the Wave-2 widened note key set.
//
// This suite pins, end-to-end against the emulator, that note create and
// update are refused for clients: the optimistic version precondition (Decision
// 2.4, §3.8) now runs in plcNotesWriteV1, whose own tests keep the allow cases.
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-notes-version-rules';
const PLC_ID = 'p1';
const NOTE_ID = 'n1';

const MEMBER_UID = 'member-uid';
const MEMBER2_UID = 'member2-uid';
const OUTSIDER_UID = 'outsider-uid';

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

const asOutsider = () =>
  testEnv
    .authenticatedContext(OUTSIDER_UID, { email: 'outsider@example.com' })
    .firestore();

const notePath = `plcs/${PLC_ID}/notes/${NOTE_ID}`;

/** A fully-formed versioned meeting note; override any field per test. */
const versionedNote = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  title: 'Unit 4 CFA debrief',
  body: '## Agenda',
  kind: 'meeting',
  meetingId: 'm1',
  createdBy: MEMBER_UID,
  createdAt: 1,
  lastEditedBy: MEMBER_UID,
  lastEditedAt: 1,
  version: 1,
  deletedAt: null,
  ...overrides,
});

/** A legacy note with no `version` field (pre-Wave-2 shape). */
const legacyNote = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  title: 'Legacy',
  body: 'No version field',
  createdBy: MEMBER_UID,
  createdAt: 1,
  lastEditedBy: MEMBER_UID,
  lastEditedAt: 1,
  ...overrides,
});

/** Seed a doc with rules disabled (test fixture setup, not under test). */
async function seed(data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), notePath), data);
  });
}

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

// ---------------------------------------------------------------------------
// Note writes are server-only (plcNotesWriteV1 owns the version precondition)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/notes — create refused', () => {
  it('a member can no longer create a versioned note', async () => {
    await assertFails(
      setDoc(doc(asMember(), notePath), versionedNote({ version: 0 }))
    );
  });

  it('a non-member cannot create a note either', async () => {
    await assertFails(
      setDoc(doc(asOutsider(), notePath), versionedNote({ version: 0 }))
    );
  });
});

describe('plcs/{plcId}/notes — update refused', () => {
  it('a member can no longer bump the version, as author or as a teammate', async () => {
    await seed(versionedNote());
    await assertFails(
      updateDoc(doc(asMember2(), notePath), {
        body: 'edited',
        lastEditedBy: MEMBER2_UID,
        lastEditedAt: 2,
        version: 2,
      })
    );
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        body: 'edited',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 2,
      })
    );
  });

  it('a member can no longer soft-delete alongside the version bump', async () => {
    await seed(versionedNote());
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        deletedAt: 5,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 5,
        version: 2,
      })
    );
  });

  it('an unversioned legacy note cannot be edited by a client either', async () => {
    await seed(legacyNote());
    await assertFails(
      updateDoc(doc(asMember(), notePath), {
        body: 'edited legacy',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
      })
    );
  });

  it('a non-member cannot update a note', async () => {
    await seed(versionedNote());
    await assertFails(
      updateDoc(doc(asOutsider(), notePath), {
        body: 'x',
        lastEditedBy: OUTSIDER_UID,
        lastEditedAt: 2,
        version: 2,
      })
    );
  });
});
