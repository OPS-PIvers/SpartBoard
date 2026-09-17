// Firestore security-rules coverage for the note CRDT transport: the
// `yUpdates` update log and the `yState` snapshot field on the note doc.
//
// The contract the client `usePlcNoteCrdt` relies on:
//   - Any member reads the update log; only a non-viewer member appends to it.
//   - An update carries its author's uid and cannot be forged for a teammate.
//   - Updates are immutable — compaction deletes them, it never rewrites them.
//   - An outsider touches nothing.
//   - `yState` is accepted on a note as an optional string and stays inside the
//     existing version precondition, so the snapshot write cannot smuggle a
//     content change past the `new == old + 1` check.
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
  updateDoc,
  deleteDoc,
  getDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-note-crdt-rules';
const PLC_ID = 'p1';
const NOTE_ID = 'n1';
const UPDATE_ID = 'u1';

const EDITOR_UID = 'editor-uid';
const EDITOR_EMAIL = 'editor@example.com';
const EDITOR2_UID = 'editor2-uid';
const EDITOR2_EMAIL = 'editor2@example.com';
const VIEWER_UID = 'viewer-uid';
const VIEWER_EMAIL = 'viewer@example.com';
const OUTSIDER_UID = 'outsider-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asEditor = () =>
  testEnv.authenticatedContext(EDITOR_UID, { email: EDITOR_EMAIL }).firestore();
const asEditor2 = () =>
  testEnv
    .authenticatedContext(EDITOR2_UID, { email: EDITOR2_EMAIL })
    .firestore();
const asViewer = () =>
  testEnv.authenticatedContext(VIEWER_UID, { email: VIEWER_EMAIL }).firestore();
const asOutsider = () =>
  testEnv
    .authenticatedContext(OUTSIDER_UID, { email: 'outsider@example.com' })
    .firestore();

const notePath = `plcs/${PLC_ID}/notes/${NOTE_ID}`;
const updatesPath = `${notePath}/yUpdates`;

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

const yUpdate = (overrides: Record<string, unknown> = {}) => ({
  u: 'AQHtqZ7WAwAHAQRib2R5AwFo',
  uid: EDITOR_UID,
  at: serverTimestamp(),
  ...overrides,
});

const note = (overrides: Record<string, unknown> = {}) => ({
  id: NOTE_ID,
  title: 'Unit 4 CFA debrief',
  body: '## Agenda',
  createdBy: EDITOR_UID,
  createdAt: 1,
  lastEditedBy: EDITOR_UID,
  lastEditedAt: 1,
  version: 1,
  ...overrides,
});

async function seedNote(data: Record<string, unknown> = note()): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), notePath), data);
  });
}

async function seedUpdate(id = UPDATE_ID): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `${updatesPath}/${id}`), {
      u: 'AQHtqZ7WAwAHAQRib2R5AwFo',
      uid: EDITOR_UID,
      at: 1,
    });
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
      leadUid: EDITOR_UID,
      memberUids: [EDITOR_UID, EDITOR2_UID, VIEWER_UID],
      memberEmails: {
        [EDITOR_UID]: EDITOR_EMAIL,
        [EDITOR2_UID]: EDITOR2_EMAIL,
        [VIEWER_UID]: VIEWER_EMAIL,
      },
      members: {
        [EDITOR_UID]: member(EDITOR_UID, EDITOR_EMAIL, 'lead'),
        [EDITOR2_UID]: member(EDITOR2_UID, EDITOR2_EMAIL, 'member'),
        [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
  await seedNote();
});

describe('plcs/{plcId}/notes/{noteId}/yUpdates — CRDT update log', () => {
  it('lets a member append an update', async () => {
    await assertSucceeds(
      setDoc(doc(asEditor(), `${updatesPath}/${UPDATE_ID}`), yUpdate())
    );
  });

  it('lets a second member append concurrently', async () => {
    await assertSucceeds(
      setDoc(
        doc(asEditor2(), `${updatesPath}/u2`),
        yUpdate({ uid: EDITOR2_UID })
      )
    );
  });

  it('lets any member read the log', async () => {
    await seedUpdate();
    await assertSucceeds(
      getDoc(doc(asViewer(), `${updatesPath}/${UPDATE_ID}`))
    );
  });

  it('denies a viewer appending an update', async () => {
    await assertFails(
      setDoc(
        doc(asViewer(), `${updatesPath}/${UPDATE_ID}`),
        yUpdate({ uid: VIEWER_UID })
      )
    );
  });

  it('denies an outsider reading or appending', async () => {
    await seedUpdate();
    await assertFails(getDoc(doc(asOutsider(), `${updatesPath}/${UPDATE_ID}`)));
    await assertFails(
      setDoc(
        doc(asOutsider(), `${updatesPath}/u3`),
        yUpdate({ uid: OUTSIDER_UID })
      )
    );
  });

  it('denies forging a teammate as the author', async () => {
    await assertFails(
      setDoc(
        doc(asEditor(), `${updatesPath}/${UPDATE_ID}`),
        yUpdate({ uid: EDITOR2_UID })
      )
    );
  });

  it('rejects an unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(
        doc(asEditor(), `${updatesPath}/${UPDATE_ID}`),
        yUpdate({ clientId: 42 })
      )
    );
  });

  it('rejects a non-string payload', async () => {
    await assertFails(
      setDoc(doc(asEditor(), `${updatesPath}/${UPDATE_ID}`), yUpdate({ u: 7 }))
    );
  });

  it('rejects a payload past the size cap', async () => {
    await assertFails(
      setDoc(
        doc(asEditor(), `${updatesPath}/${UPDATE_ID}`),
        yUpdate({ u: 'x'.repeat(200_001) })
      )
    );
  });

  it('denies rewriting an existing update', async () => {
    await seedUpdate();
    await assertFails(
      updateDoc(doc(asEditor(), `${updatesPath}/${UPDATE_ID}`), { u: 'tamper' })
    );
  });

  it('lets a member delete a compacted update', async () => {
    await seedUpdate();
    await assertSucceeds(
      deleteDoc(doc(asEditor(), `${updatesPath}/${UPDATE_ID}`))
    );
  });

  it('denies a viewer deleting an update', async () => {
    await seedUpdate();
    await assertFails(
      deleteDoc(doc(asViewer(), `${updatesPath}/${UPDATE_ID}`))
    );
  });
});

describe('plcs/{plcId}/notes/{noteId} — yState snapshot field', () => {
  it('accepts a snapshot write that bumps the version', async () => {
    await assertSucceeds(
      updateDoc(doc(asEditor(), notePath), {
        yState: 'AQHtqZ7WAwAHAQRib2R5AwFo',
        lastEditedBy: EDITOR_UID,
        lastEditedAt: serverTimestamp(),
        version: 2,
      })
    );
  });

  it('accepts yState on create', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), notePath));
    });
    await assertSucceeds(
      setDoc(
        doc(asEditor(), notePath),
        note({ version: 0, yState: 'AQHtqZ7WAwAHAQRib2R5AwFo' })
      )
    );
  });

  it('rejects a non-string yState', async () => {
    await assertFails(
      updateDoc(doc(asEditor(), notePath), {
        yState: 42,
        lastEditedBy: EDITOR_UID,
        lastEditedAt: serverTimestamp(),
        version: 2,
      })
    );
  });

  it('still enforces the version precondition on a snapshot write', async () => {
    await assertFails(
      updateDoc(doc(asEditor(), notePath), {
        yState: 'AQHtqZ7WAwAHAQRib2R5AwFo',
        lastEditedBy: EDITOR_UID,
        lastEditedAt: serverTimestamp(),
        version: 1,
      })
    );
  });

  it('denies a viewer writing a snapshot', async () => {
    await assertFails(
      updateDoc(doc(asViewer(), notePath), {
        yState: 'AQHtqZ7WAwAHAQRib2R5AwFo',
        lastEditedBy: VIEWER_UID,
        lastEditedAt: serverTimestamp(),
        version: 2,
      })
    );
  });
});
