// Firestore security-rules regression for the `/plcs/{plcId}/folders/{folderId}`
// match block (PLC_ASSESSMENT_DATA §3.4/§4/§7.3):
//   - membership-gated reads
//   - non-viewer member (plcCanEditContent) create/update/delete
//   - schema lock-down (`keys().hasOnly([...])`), non-empty `name`
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

const PROJECT_ID = 'spartboard-plc-folders';
const PLC_ID = 'plc-folders-rules-test';
const FOLDER_ID = 'folder-rules-test';

const MEMBER_UID = 'member-uid';
const OTHER_MEMBER_UID = 'other-member-uid';
const VIEWER_UID = 'viewer-uid';
const NON_MEMBER_UID = 'non-member-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMember = () =>
  testEnv
    .authenticatedContext(MEMBER_UID, { email: 'member@example.com' })
    .firestore();

const asOtherMember = () =>
  testEnv
    .authenticatedContext(OTHER_MEMBER_UID, { email: 'other@example.com' })
    .firestore();

const asViewer = () =>
  testEnv
    .authenticatedContext(VIEWER_UID, { email: 'viewer@example.com' })
    .firestore();

const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'random@example.com' })
    .firestore();

const validFolder = (overrides: Record<string, unknown> = {}) => ({
  name: 'Unit 4',
  parentId: null,
  order: 0,
  createdAt: 1000,
  updatedAt: 1000,
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
      memberUids: [MEMBER_UID, OTHER_MEMBER_UID, VIEWER_UID],
      memberEmails: {
        [MEMBER_UID]: 'member@example.com',
        [OTHER_MEMBER_UID]: 'other@example.com',
        [VIEWER_UID]: 'viewer@example.com',
      },
      members: {
        [MEMBER_UID]: { role: 'lead' },
        [OTHER_MEMBER_UID]: { role: 'member' },
        [VIEWER_UID]: { role: 'viewer' },
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/folders — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`),
        validFolder()
      );
    });
  });

  it('a PLC member can read folders', async () => {
    await assertSucceeds(
      getDoc(doc(asOtherMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`))
    );
  });

  it('a non-member cannot read folders (membership gate)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`))
    );
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/folders — create', () => {
  it('a non-viewer member can create a valid folder', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`),
        validFolder()
      )
    );
  });

  it('rejects extra unknown fields (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`), {
        ...validFolder(),
        unexpected: 'extra',
      })
    );
  });

  it('rejects an empty name', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`),
        validFolder({ name: '' })
      )
    );
  });

  it('a viewer cannot create a folder', async () => {
    await assertFails(
      setDoc(
        doc(asViewer(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`),
        validFolder()
      )
    );
  });

  it('a non-member cannot create a folder', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`),
        validFolder()
      )
    );
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/folders — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`),
        validFolder()
      );
    });
  });

  it('a non-viewer member can rename a folder', async () => {
    await assertSucceeds(
      updateDoc(doc(asOtherMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`), {
        name: 'Renamed Unit',
        updatedAt: 2000,
      })
    );
  });

  it('a viewer cannot rename a folder', async () => {
    await assertFails(
      updateDoc(doc(asViewer(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`), {
        name: 'Renamed Unit',
        updatedAt: 2000,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/folders — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`),
        validFolder()
      );
    });
  });

  it('a non-viewer member can delete a folder', async () => {
    await assertSucceeds(
      deleteDoc(doc(asMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`))
    );
  });

  it('a non-member cannot delete a folder', async () => {
    await assertFails(
      deleteDoc(doc(asNonMember(), `plcs/${PLC_ID}/folders/${FOLDER_ID}`))
    );
  });
});
