// Firestore security-rules coverage for the Wave-2 soft-delete / restore flips
// (Decision 3.1, §3.10) on PLC notes + to-dos. Proves the client can no longer
// flip `deletedAt` on either: plcNotesWriteV1 and plcTeamItemsV1 do it now.
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
import { setDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-soft-delete-rules';
const PLC_ID = 'p1';
const NOTE_ID = 'n1';
const TODO_ID = 'td1';

const MEMBER_UID = 'member-uid';
const NON_MEMBER_UID = 'non-member-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validNote = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  title: 'Meeting agenda',
  body: 'Discuss the common assessment.',
  createdBy: MEMBER_UID,
  createdAt: 1000,
  lastEditedBy: MEMBER_UID,
  lastEditedAt: 1000,
  version: 0,
  ...overrides,
});

const validTodo = (overrides: Record<string, unknown> = {}) => ({
  id: TODO_ID,
  text: 'Run the CFA',
  done: false,
  createdBy: MEMBER_UID,
  createdAt: 1000,
  ...overrides,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID],
      memberEmails: { [MEMBER_UID]: 'member@example.com' },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
      validNote()
    );
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
      validTodo()
    );
  });
});

// ---------------------------------------------------------------------------
// Notes — soft-delete / restore are server-only (plcNotesWriteV1)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/notes — soft-delete / restore refused', () => {
  const noteRef = (db: ReturnType<typeof asMember>) =>
    doc(db, `plcs/${PLC_ID}/notes/${NOTE_ID}`);

  it('a member can no longer soft-delete a note, with either time format', async () => {
    await assertFails(
      updateDoc(noteRef(asMember()), {
        deletedAt: serverTimestamp(),
        lastEditedBy: MEMBER_UID,
        lastEditedAt: serverTimestamp(),
        version: 1,
      })
    );
    await assertFails(
      updateDoc(noteRef(asMember()), {
        deletedAt: 1717000000000,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2000,
        version: 1,
      })
    );
  });

  it('a member can no longer restore a note', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        validNote({ deletedAt: 1717000000000, version: 1 })
      );
    });
    await assertFails(
      updateDoc(noteRef(asMember()), {
        deletedAt: null,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2000,
        version: 2,
      })
    );
  });

  it('a non-member cannot soft-delete a note', async () => {
    await assertFails(
      updateDoc(noteRef(asNonMember()), {
        deletedAt: 1717000000000,
        lastEditedBy: NON_MEMBER_UID,
        lastEditedAt: 2000,
        version: 1,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// To-dos — soft-delete / restore are server-only (plcTeamItemsV1)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/todos — soft-delete / restore refused (legacy)', () => {
  const todoRef = (db: ReturnType<typeof asMember>) =>
    doc(db, `plcs/${PLC_ID}/todos/${TODO_ID}`);

  it('a member can no longer soft-delete a to-do, with either time format', async () => {
    await assertFails(
      updateDoc(todoRef(asMember()), { deletedAt: serverTimestamp() })
    );
    await assertFails(
      updateDoc(todoRef(asMember()), { deletedAt: 1717000000000 })
    );
  });

  it('a member can no longer restore a to-do', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
        validTodo({ deletedAt: 1717000000000 })
      );
    });
    await assertFails(updateDoc(todoRef(asMember()), { deletedAt: null }));
  });

  it('a non-member cannot soft-delete a to-do', async () => {
    await assertFails(
      updateDoc(todoRef(asNonMember()), { deletedAt: 1717000000000 })
    );
  });
});
