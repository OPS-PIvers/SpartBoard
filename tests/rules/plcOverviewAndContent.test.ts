// Firestore rules regression coverage for the new PLC Overview /
// Notes / To-Dos surfaces shipped alongside Phase 5 of the PLC Dashboard
// roadmap. Pins the security invariants the dashboard depends on:
//   - `users/{uid}/plc_layouts/{plcId}` is retired: no client access.
//   - `plcs/{plcId}/notes` and `plcs/{plcId}/todos` are membership-gated
//     for reads — non-members must not be able to peek into a community's
//     shared documents. `todos` is legacy: create is denied and update
//     accepts only the `deletedAt` tombstone.
//   - Notes' `createdBy` / `createdAt` / `id` are immutable on update so
//     a later editor can't rewrite authorship.
//   - On every note update the caller must stamp themselves into
//     `lastEditedBy` so the audit trail stays honest.
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

const PROJECT_ID = 'spartboard-plc-overview-and-content';
const PLC_ID = 'plc-rules-test';
const NOTE_ID = 'note-rules-test';
const TODO_ID = 'todo-rules-test';

const MEMBER_A_UID = 'member-a-uid';
const MEMBER_B_UID = 'member-b-uid';
const NON_MEMBER_UID = 'non-member-uid';

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
      leadUid: MEMBER_A_UID,
      memberUids: [MEMBER_A_UID, MEMBER_B_UID],
      memberEmails: {
        [MEMBER_A_UID]: 'member-a@example.com',
        [MEMBER_B_UID]: 'member-b@example.com',
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// users/{uid}/plc_layouts/{plcId}
// ---------------------------------------------------------------------------

describe('users/{uid}/plc_layouts — retired, no client access', () => {
  it('even the owner cannot read or write a layout doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`),
        { tiles: [], updatedAt: 100 }
      );
    });
    const ref = doc(asMemberA(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { tiles: [], updatedAt: 200 }));
  });
});

// ---------------------------------------------------------------------------
// plcs/{plcId}/notes
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/notes — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        id: NOTE_ID,
        title: 'Hello',
        body: 'World',
        createdBy: MEMBER_A_UID,
        createdAt: 1,
        lastEditedBy: MEMBER_A_UID,
        lastEditedAt: 1,
      });
    });
  });

  it('a PLC member can read notes', async () => {
    await assertSucceeds(
      getDoc(doc(asMemberB(), `plcs/${PLC_ID}/notes/${NOTE_ID}`))
    );
  });

  it('a non-member cannot read notes (membership gate)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`))
    );
  });
});

describe('plcs/{plcId}/notes — write', () => {
  const validNote = (overrides: Record<string, unknown> = {}) => ({
    id: NOTE_ID,
    title: 'Title',
    body: 'Body',
    createdBy: MEMBER_A_UID,
    createdAt: 1,
    lastEditedBy: MEMBER_A_UID,
    lastEditedAt: 1,
    ...overrides,
  });

  it('a member can no longer create a note, with either time format', async () => {
    const ref = doc(asMemberA(), `plcs/${PLC_ID}/notes/${NOTE_ID}`);
    await assertFails(setDoc(ref, validNote()));
    await assertFails(
      setDoc(
        ref,
        validNote({
          createdAt: serverTimestamp(),
          lastEditedAt: serverTimestamp(),
        })
      )
    );
  });

  it('a non-member cannot create a note either', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        validNote({ createdBy: NON_MEMBER_UID, lastEditedBy: NON_MEMBER_UID })
      )
    );
  });

  describe('update', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
          validNote()
        );
      });
    });

    it('a member can no longer edit a note, as author or teammate', async () => {
      await assertFails(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
          body: 'Edited',
          lastEditedBy: MEMBER_B_UID,
          lastEditedAt: serverTimestamp(),
        })
      );
      await assertFails(
        updateDoc(doc(asMemberA(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
          body: 'Edited',
          lastEditedBy: MEMBER_A_UID,
          lastEditedAt: 2,
        })
      );
    });

    it('a non-member cannot edit', async () => {
      await assertFails(
        updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
          body: 'Edited',
          lastEditedBy: NON_MEMBER_UID,
          lastEditedAt: 2,
        })
      );
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
          validNote()
        );
      });
    });

    it('any member can delete (PLC-owned note model)', async () => {
      await assertSucceeds(
        deleteDoc(doc(asMemberB(), `plcs/${PLC_ID}/notes/${NOTE_ID}`))
      );
    });

    it('a non-member cannot delete', async () => {
      await assertFails(
        deleteDoc(doc(asNonMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`))
      );
    });
  });
});

// ---------------------------------------------------------------------------
// plcs/{plcId}/todos
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/todos — writes refused (legacy, plcTeamItemsV1 archives them)', () => {
  const validTodo = (overrides: Record<string, unknown> = {}) => ({
    id: TODO_ID,
    text: 'Do the thing',
    done: false,
    createdBy: MEMBER_A_UID,
    createdAt: 1,
    ...overrides,
  });

  it('denies creating a todo, even for a current member', async () => {
    await assertFails(
      setDoc(doc(asMemberA(), `plcs/${PLC_ID}/todos/${TODO_ID}`), validTodo())
    );
  });

  it('rejects creation by a non-member', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
        validTodo({ createdBy: NON_MEMBER_UID })
      )
    );
  });

  describe('with an existing todo', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
          validTodo()
        );
      });
    });

    it('a member can no longer mark it done or archive it', async () => {
      await assertFails(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
          done: true,
        })
      );
      await assertFails(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
          deletedAt: Date.now(),
        })
      );
    });

    it('a non-member cannot edit or archive', async () => {
      await assertFails(
        updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
          done: true,
        })
      );
      await assertFails(
        updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
          deletedAt: Date.now(),
        })
      );
    });

    it('no one can hard-delete it', async () => {
      await assertFails(
        deleteDoc(doc(asMemberA(), `plcs/${PLC_ID}/todos/${TODO_ID}`))
      );
    });
  });
});
