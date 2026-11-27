// Firestore security rules regression coverage for the Wave-2 shape of
// `plcs/{plcId}/notes` and `plcs/{plcId}/todos` (§3.8, §3.9, §3.10): client
// writes to both are refused (plcNotesWriteV1 and plcTeamItemsV1 write them).
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

describe('plcs/{plcId}/notes — Wave-2 fields (writes are server-only)', () => {
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
  const noteRef = () => doc(asMember(), `plcs/${PLC_ID}/notes/${NOTE_ID}`);
  const seedNote = (data: Record<string, unknown> = meetingNote()) =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        data
      );
    });

  it('a member can no longer create a meeting note with kind/meetingId/version', async () => {
    await assertFails(setDoc(noteRef(), meetingNote({ version: 0 })));
  });

  it('a member can no longer bump the version or soft-delete', async () => {
    await seedNote();
    await assertFails(
      updateDoc(noteRef(), {
        body: 'edited',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 2,
      })
    );
    await assertFails(
      updateDoc(noteRef(), {
        deletedAt: serverTimestamp(),
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
        version: 2,
      })
    );
  });

  it('a member can no longer edit an unversioned note', async () => {
    await seedNote({
      id: NOTE_ID,
      title: 'Legacy',
      body: 'No version field',
      createdBy: MEMBER_UID,
      createdAt: 1,
      lastEditedBy: MEMBER_UID,
      lastEditedAt: 1,
    });
    await assertFails(
      updateDoc(noteRef(), {
        body: 'edited legacy',
        lastEditedBy: MEMBER_UID,
        lastEditedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Todos — new fields + soft-delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/todos — Wave-2 fields (legacy, writes are server-only)', () => {
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

  it('denies creating a todo, assigned or unassigned', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), actionItem())
    );
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
        actionItem({ assigneeUid: null, dueAt: null, meetingId: null })
      )
    );
  });

  it('denies reassigning a todo or archiving it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/todos/${TODO_ID}`),
        actionItem()
      );
    });
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        assigneeUid: MEMBER_UID,
        deletedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: serverTimestamp(),
      })
    );
  });
});
