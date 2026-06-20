// Firestore security rules regression coverage for the Wave-2 widening of
// `plcs/{plcId}/notes` and `plcs/{plcId}/todos` (§3.8, §3.9, §3.10):
//   - notes accept the new optional `kind` / `meetingId` / `version` /
//     `deletedAt` fields; the `version` precondition enforces +1 on update
//     (with a both-absent rollout escape hatch).
//   - todos accept the new optional `assigneeUid` / `dueAt` / `meetingId` /
//     `deletedAt` fields.
//   - Soft-delete (`deletedAt`) round-trips for both.
//   - Bad shapes (wrong kind, wrong types, version skip) are rejected.
//
// The pre-existing notes/todos suite (plcOverviewAndContent.test.ts) continues
// to cover the legacy field set; this file pins ONLY the new surface so the
// two stay independently readable.
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

const PROJECT_ID = 'spartboard-plc-notes-todos-wave2-rules';
const PLC_ID = 'p1';
const NOTE_ID = 'n1';
const TODO_ID = 't1';

const MEMBER_UID = 'member-uid';
const MEMBER2_UID = 'member2-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMember = () =>
  testEnv
    .authenticatedContext(MEMBER_UID, { email: 'member@example.com' })
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

// ---------------------------------------------------------------------------
// Notes — new fields + version precondition + soft-delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/notes — Wave-2 fields', () => {
  const meetingNote = (overrides: Record<string, unknown> = {}) => ({
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

  it('member can create a meeting note with kind/meetingId/version', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), meetingNote())
    );
  });

  it('rejects an invalid kind value', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({ kind: 'agenda' })
      )
    );
  });

  it('version update must be exactly old + 1', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({ version: 3 })
      );
    });
    await assertSucceeds(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({ version: 4, lastEditedAt: 2 })
      )
    );
  });

  it('rejects a stale version bump (skips a number)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({ version: 3 })
      );
    });
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({ version: 5, lastEditedAt: 2 })
      )
    );
  });

  it('rejects a same-version write (no bump)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({ version: 3 })
      );
    });
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({ version: 3, lastEditedAt: 2 })
      )
    );
  });

  it('accepts an update where both old and new omit version (rollout)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        id: NOTE_ID,
        title: 'Legacy',
        body: 'No version field',
        createdBy: MEMBER_UID,
        createdAt: 1,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 1,
      });
    });
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        body: 'edited',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
      })
    );
  });

  it('rejects adding a version when the stored doc has none (rollout guard)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        id: NOTE_ID,
        title: 'Legacy',
        body: 'No version field',
        createdBy: MEMBER_UID,
        createdAt: 1,
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 1,
      });
    });
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        body: 'edited',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 1,
      })
    );
  });

  it('member can soft-delete a note via deletedAt + version bump', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({ version: 1 })
      );
    });
    await assertSucceeds(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        meetingNote({
          version: 2,
          deletedAt: serverTimestamp(),
          lastEditedAt: 2,
        })
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Todos — new fields + soft-delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/todos — Wave-2 fields', () => {
  const actionItem = (overrides: Record<string, unknown> = {}) => ({
    id: TODO_ID,
    text: 'Reteach Q3 to period 2',
    done: false,
    assigneeUid: MEMBER2_UID,
    dueAt: 1700000000000,
    meetingId: 'm1',
    createdBy: MEMBER_UID,
    createdAt: 1,
    deletedAt: null,
    ...overrides,
  });

  it('member can create a todo with assignee/due/meetingId', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), actionItem())
    );
  });

  it('member can create a todo with null assignee/due (unassigned)', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
        actionItem({ assigneeUid: null, dueAt: null, meetingId: null })
      )
    );
  });

  it('rejects a non-int dueAt', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
        actionItem({ dueAt: 'tomorrow' })
      )
    );
  });

  it('member can reassign + soft-delete a todo', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
        actionItem()
      );
    });
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        assigneeUid: MEMBER_UID,
        deletedAt: serverTimestamp(),
      })
    );
  });

  it('rejects an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        ...actionItem(),
        priority: 'high',
      })
    );
  });
});
