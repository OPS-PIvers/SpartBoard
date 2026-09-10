// Firestore security rules regression coverage for PLC meeting-note action
// items (Decision 3.5/7.4, docs/plans/PLC_ASSESSMENT_DATA.md §3.5 / §7.4):
//   - notes accept the new optional `actionItems` list (capped at 200).
//   - todos are legacy: create is now denied, and update accepts ONLY the
//     `deletedAt` tombstone (archiving an imported to-do).
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
import { setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-action-items-rules';
const PLC_ID = 'p1';
const NOTE_ID = 'n1';
const TODO_ID = 't1';

const EDITOR_UID = 'editor-uid';
const EDITOR_EMAIL = 'editor@example.com';
const VIEWER_UID = 'viewer-uid';
const VIEWER_EMAIL = 'viewer@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asEditor = () =>
  testEnv.authenticatedContext(EDITOR_UID, { email: EDITOR_EMAIL }).firestore();
const asViewer = () =>
  testEnv.authenticatedContext(VIEWER_UID, { email: VIEWER_EMAIL }).firestore();

const member = (
  uid: string,
  email: string,
  role: 'lead' | 'coLead' | 'member' | 'viewer'
) => ({
  uid,
  email,
  displayName: email.split('@')[0],
  role,
  joinedAt: 1,
  status: 'active',
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: EDITOR_UID,
      memberUids: [EDITOR_UID, VIEWER_UID],
      memberEmails: {
        [EDITOR_UID]: EDITOR_EMAIL,
        [VIEWER_UID]: VIEWER_EMAIL,
      },
      members: {
        [EDITOR_UID]: member(EDITOR_UID, EDITOR_EMAIL, 'member'),
        [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

const actionItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'ai1',
  text: 'Reteach fractions',
  done: false,
  assigneeUid: null,
  dueAt: null,
  createdBy: EDITOR_UID,
  createdAt: 1,
  doneAt: null,
  ...overrides,
});

const note = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  title: 'Unit 4 CFA debrief',
  body: '## Agenda',
  kind: 'meeting',
  meetingId: 'm1',
  createdBy: EDITOR_UID,
  createdAt: 1,
  lastEditedBy: EDITOR_UID,
  lastEditedAt: 1,
  version: 0,
  ...overrides,
});

describe('plcs/{plcId}/notes — actionItems', () => {
  it('accepts a valid actionItems list on create', async () => {
    await assertSucceeds(
      setDoc(
        doc(asEditor(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        note({ actionItems: [actionItem()] })
      )
    );
  });

  it('accepts a valid actionItems list on update', async () => {
    await seed(`plcs/${PLC_ID}/notes/${NOTE_ID}`, note());
    await assertSucceeds(
      updateDoc(doc(asEditor(), `plcs/${PLC_ID}/notes/${NOTE_ID}`), {
        lastEditedBy: EDITOR_UID,
        lastEditedAt: 2,
        version: 1,
        actionItems: [actionItem()],
      })
    );
  });

  it('rejects actionItems as a string', async () => {
    await assertFails(
      setDoc(
        doc(asEditor(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        note({ actionItems: 'not-a-list' })
      )
    );
  });

  it('rejects an actionItems list over the 200-item cap', async () => {
    const items = Array.from({ length: 201 }, (_, i) =>
      actionItem({ id: `ai${i}` })
    );
    await assertFails(
      setDoc(
        doc(asEditor(), `plcs/${PLC_ID}/notes/${NOTE_ID}`),
        note({ actionItems: items })
      )
    );
  });
});

describe('plcs/{plcId}/todos — legacy, read-only-ish', () => {
  const todo = (overrides: Record<string, unknown> = {}) => ({
    id: TODO_ID,
    text: 'Legacy todo',
    done: false,
    createdBy: EDITOR_UID,
    createdAt: 1,
    ...overrides,
  });

  it('denies creating a new todo', async () => {
    await assertFails(
      setDoc(doc(asEditor(), `plcs/${PLC_ID}/todos/${TODO_ID}`), todo())
    );
  });

  it('allows an editor to archive (soft-delete) a legacy todo', async () => {
    await seed(`plcs/${PLC_ID}/todos/${TODO_ID}`, todo());
    await assertSucceeds(
      updateDoc(doc(asEditor(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: Date.now(),
      })
    );
  });

  it('denies a viewer archiving a legacy todo', async () => {
    await seed(`plcs/${PLC_ID}/todos/${TODO_ID}`, todo());
    await assertFails(
      updateDoc(doc(asViewer(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        deletedAt: Date.now(),
      })
    );
  });

  it('denies an update touching `text`', async () => {
    await seed(`plcs/${PLC_ID}/todos/${TODO_ID}`, todo());
    await assertFails(
      updateDoc(doc(asEditor(), `plcs/${PLC_ID}/todos/${TODO_ID}`), {
        text: 'Edited',
      })
    );
  });
});
