// Firestore rules regression coverage for the new PLC Overview /
// Notes / To-Dos surfaces shipped alongside Phase 5 of the PLC Dashboard
// roadmap. Pins the security invariants the dashboard depends on:
//   - `users/{uid}/plc_layouts/{plcId}` is owner-only with a closed schema
//     so a malicious extension can't smuggle extra fields.
//   - `plcs/{plcId}/notes` and `plcs/{plcId}/todos` are membership-gated
//     for both reads and writes — non-members must not be able to peek
//     into a community's shared documents.
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
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

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

describe('users/{uid}/plc_layouts — owner-only', () => {
  const validLayout = (overrides: Record<string, unknown> = {}) => ({
    tiles: [{ kind: 'todos', size: 'lg' }],
    updatedAt: 100,
    ...overrides,
  });

  it('owner can write their own layout doc', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMemberA(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`),
        validLayout()
      )
    );
  });

  it('owner can read their own layout doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`),
        validLayout()
      );
    });
    await assertSucceeds(
      getDoc(doc(asMemberA(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`))
    );
  });

  it("a different user cannot read or write someone else's layout", async () => {
    // Even fellow PLC members can't see each other's layout — this is
    // strictly view preferences, scoped by uid.
    await assertFails(
      setDoc(
        doc(asMemberB(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`),
        validLayout()
      )
    );
    await assertFails(
      getDoc(doc(asMemberB(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`))
    );
  });

  it('rejects an extra field (schema lock-down via keys().hasOnly)', async () => {
    await assertFails(
      setDoc(doc(asMemberA(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`), {
        ...validLayout(),
        unexpected: 'extra-field',
      })
    );
  });

  it('rejects when tiles is not a list', async () => {
    await assertFails(
      setDoc(doc(asMemberA(), `users/${MEMBER_A_UID}/plc_layouts/${PLC_ID}`), {
        tiles: 'not-a-list',
        updatedAt: 1,
      })
    );
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

  it('any current member can create a note', async () => {
    await assertSucceeds(
      setDoc(doc(asMemberA(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), validNote())
    );
  });

  it('rejects creation by a non-member', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        validNote({ createdBy: NON_MEMBER_UID, lastEditedBy: NON_MEMBER_UID })
      )
    );
  });

  it('rejects extra unknown fields (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMemberA(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        ...validNote(),
        unexpected: 'extra-field',
      })
    );
  });

  it('rejects when path id != payload id', async () => {
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/notes/different-id`),
        validNote({ id: NOTE_ID })
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

    it('a different member can edit (any-member-edits model)', async () => {
      await assertSucceeds(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
          body: 'edited by B',
          lastEditedBy: MEMBER_B_UID,
          lastEditedAt: 2,
        })
      );
    });

    it('rejects when lastEditedBy != caller (no impersonation)', async () => {
      await assertFails(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
          body: 'edited',
          lastEditedBy: MEMBER_A_UID, // pretending to be A
          lastEditedAt: 2,
        })
      );
    });

    it('rejects createdBy mutation (immutability)', async () => {
      await assertFails(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
          createdBy: MEMBER_B_UID,
          lastEditedBy: MEMBER_B_UID,
          lastEditedAt: 2,
        })
      );
    });

    it('rejects createdAt mutation (immutability)', async () => {
      await assertFails(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
          createdAt: 9999,
          lastEditedBy: MEMBER_B_UID,
          lastEditedAt: 2,
        })
      );
    });

    it('a non-member cannot edit', async () => {
      await assertFails(
        updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
          body: 'leaked',
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

describe('plcs/{plcId}/todos — write', () => {
  const validTodo = (overrides: Record<string, unknown> = {}) => ({
    id: TODO_ID,
    text: 'Do the thing',
    done: false,
    createdBy: MEMBER_A_UID,
    createdAt: 1,
    ...overrides,
  });

  it('any current member can create a todo', async () => {
    await assertSucceeds(
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

  it('rejects extra unknown fields (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMemberA(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        ...validTodo(),
        assignedTo: 'someone',
      })
    );
  });

  describe('update', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
          validTodo()
        );
      });
    });

    it("a different member can mark a teammate's todo done", async () => {
      await assertSucceeds(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
          done: true,
        })
      );
    });

    it('rejects createdBy mutation', async () => {
      await assertFails(
        updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
          createdBy: MEMBER_B_UID,
        })
      );
    });

    it('a non-member cannot edit', async () => {
      await assertFails(
        updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
          done: true,
        })
      );
    });
  });
});
