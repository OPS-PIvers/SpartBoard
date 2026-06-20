// Firestore security-rules coverage for the Wave-2 soft-delete / restore flips
// (Decision 3.1, §3.10) on PLC notes + to-dos. Proves:
//   - A member may SET `deletedAt` (soft-delete) and CLEAR it back to null
//     (restore) within the widened `keys().hasOnly([...])` schema lock.
//   - `deletedAt` accepts a Firestore timestamp, an int (Date.now() rollout),
//     and null; a non-int/non-timestamp value is rejected (plcSubDeletedAtOk).
//   - Identity stays immutable through a soft-delete/restore: a tombstone write
//     that also mutates `id` / `createdBy` / `createdAt` is rejected.
//   - The note version precondition still applies on a soft-delete that flips
//     `deletedAt` (version must bump +1 on a versioned note; both-absent rollout
//     escape hatch still works).
//   - Non-members can't soft-delete or restore.
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
// Notes — soft-delete / restore
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/notes — soft-delete / restore', () => {
  it('member can soft-delete a note (set deletedAt, version+1)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: serverTimestamp(),
        lastEditedBy: MEMBER_UID,
        lastEditedAt: serverTimestamp(),
        version: 1,
      })
    );
  });

  it('accepts an int (Date.now()) deletedAt (rollout dual-accept)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: 1717000000000,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2000,
        version: 1,
      })
    );
  });

  it('member can restore a note (clear deletedAt to null, version+1)', async () => {
    // First soft-delete (version 0 -> 1).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        validNote({ deletedAt: 1717000000000, version: 1 })
      );
    });
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: null,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 3000,
        version: 2,
      })
    );
  });

  it('rejects a soft-delete whose version does not bump +1', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: 1717000000000,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2000,
        version: 0, // stale — must be old+1 == 1
      })
    );
  });

  it('soft-delete works on an un-versioned note (both-absent rollout escape hatch)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const { version: _v, ...legacy } = validNote();
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        legacy
      );
    });
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: 1717000000000,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2000,
      })
    );
  });

  it('rejects a non-int / non-timestamp deletedAt (plcSubDeletedAtOk)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: 'soon',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2000,
        version: 1,
      })
    );
  });

  it('rejects a soft-delete that also mutates createdBy (identity immutable)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: 1717000000000,
        createdBy: NON_MEMBER_UID,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2000,
        version: 1,
      })
    );
  });

  it('rejects a soft-delete that also mutates createdAt (identity immutable)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: 1717000000000,
        createdAt: 9999,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2000,
        version: 1,
      })
    );
  });

  it('non-member cannot soft-delete a note (membership gate)', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        deletedAt: 1717000000000,
        lastEditedBy: NON_MEMBER_UID,
        lastEditedAt: 2000,
        version: 1,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// To-dos — soft-delete / restore
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/todos — soft-delete / restore', () => {
  it('member can soft-delete a to-do (set deletedAt)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: serverTimestamp(),
      })
    );
  });

  it('accepts an int deletedAt (rollout dual-accept)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: 1717000000000,
      })
    );
  });

  it('member can restore a to-do (clear deletedAt to null)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
        validTodo({ deletedAt: 1717000000000 })
      );
    });
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: null,
      })
    );
  });

  it('rejects a non-int / non-timestamp deletedAt (plcSubDeletedAtOk)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: 'later',
      })
    );
  });

  it('rejects a soft-delete that also mutates createdBy (identity immutable)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: 1717000000000,
        createdBy: NON_MEMBER_UID,
      })
    );
  });

  it('rejects a soft-delete that also mutates createdAt (identity immutable)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: 1717000000000,
        createdAt: 9999,
      })
    );
  });

  it('rejects a soft-delete that also mutates id (identity immutable)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: 1717000000000,
        id: 'different-id',
      })
    );
  });

  it('non-member cannot soft-delete a to-do (membership gate)', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: 1717000000000,
      })
    );
  });
});
