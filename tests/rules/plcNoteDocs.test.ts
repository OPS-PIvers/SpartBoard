// Rules coverage for `plcs/{plcId}/noteDocs`: the Google Doc made from a note.
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

const PROJECT_ID = 'spartboard-plc-note-docs-rules';
const PLC_ID = 'p1';
const NOTE_ID = 'n1';
const PATH = `plcs/${PLC_ID}/noteDocs/${NOTE_ID}`;

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

const validNoteDoc = (overrides: Record<string, unknown> = {}) => ({
  fileId: 'file123',
  url: 'https://docs.google.com/document/d/file123/edit',
  createdBy: MEMBER_UID,
  createdAt: serverTimestamp(),
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID],
      memberEmails: { [MEMBER_UID]: 'member@example.com' },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

const seed = () =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), PATH), validNoteDoc({ createdAt: 1 }));
  });

describe('plcs/{plcId}/noteDocs — read', () => {
  beforeEach(seed);

  it('a member can read it', async () => {
    await assertSucceeds(getDoc(doc(asMember(), PATH)));
  });

  it('a non-member cannot read it', async () => {
    await assertFails(getDoc(doc(asNonMember(), PATH)));
  });
});

describe('plcs/{plcId}/noteDocs — create', () => {
  it('a member can create it', async () => {
    await assertSucceeds(setDoc(doc(asMember(), PATH), validNoteDoc()));
  });

  it('a non-member cannot create it', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), PATH),
        validNoteDoc({ createdBy: NON_MEMBER_UID })
      )
    );
  });

  it('createdBy must be the caller', async () => {
    await assertFails(
      setDoc(doc(asMember(), PATH), validNoteDoc({ createdBy: 'someone' }))
    );
  });

  it('the url must be a Google Docs link', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), PATH),
        validNoteDoc({ url: 'https://evil.example.com/doc' })
      )
    );
  });

  it('extra fields are rejected', async () => {
    await assertFails(
      setDoc(doc(asMember(), PATH), validNoteDoc({ title: 'x' }))
    );
  });
});

describe('plcs/{plcId}/noteDocs — update and delete', () => {
  beforeEach(seed);

  it('a second create (overwrite) is denied so the first doc wins', async () => {
    await assertFails(
      setDoc(doc(asMember(), PATH), validNoteDoc({ fileId: 'other' }))
    );
  });

  it('an update is denied', async () => {
    await assertFails(
      updateDoc(doc(asMember(), PATH), {
        url: 'https://docs.google.com/document/d/other/edit',
      })
    );
  });

  it('a member can delete it', async () => {
    await assertSucceeds(deleteDoc(doc(asMember(), PATH)));
  });

  it('a non-member cannot delete it', async () => {
    await assertFails(deleteDoc(doc(asNonMember(), PATH)));
  });
});
