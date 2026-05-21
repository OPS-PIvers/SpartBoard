// Firestore security rules regression coverage for `plcs/{plcId}/docs`.
// Pins the invariants introduced in the PLC redesign Wave 1:
//   - Only current PLC members can read/create/update/delete docs.
//   - On create: `id` must equal the docId path segment, `createdBy` must
//     equal the caller's uid, schema is locked via `keys().hasOnly([...])`.
//   - On update: `id`, `createdBy`, and `createdAt` are immutable.
//   - Non-members cannot read or write.
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

const PROJECT_ID = 'spartboard-plc-docs-rules';
const PLC_ID = 'p1';
const DOC_ID = 'd1';

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

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed the PLC doc so membership lookups resolve.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validDoc = (overrides: Record<string, unknown> = {}) => ({
  id: DOC_ID,
  title: 'Meeting Notes',
  url: 'https://docs.google.com/document/d/abc123',
  createdBy: MEMBER_UID,
  createdByName: 'Member Teacher',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/docs — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/docs/${DOC_ID}`),
        validDoc()
      );
    });
  });

  it('a PLC member can read a doc', async () => {
    await assertSucceeds(
      getDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`))
    );
  });

  it('a non-member cannot read a doc (membership gate)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`))
    );
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/docs — create', () => {
  it('member can create a doc with the locked schema', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), validDoc())
    );
  });

  it('non-member cannot create a doc', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`),
        validDoc({ createdBy: NON_MEMBER_UID })
      )
    );
  });

  it('rejects create when id field does not match docId path segment', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`),
        validDoc({ id: 'different-id' })
      )
    );
  });

  it('rejects create when createdBy does not match caller uid', async () => {
    await assertFails(
      setDoc(
        doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`),
        validDoc({ createdBy: NON_MEMBER_UID })
      )
    );
  });

  it('rejects create with an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        ...validDoc(),
        unexpected: 'extra-field',
      })
    );
  });

  it('rejects create missing required field title', async () => {
    const { title: _title, ...withoutTitle } = validDoc();
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), withoutTitle)
    );
  });

  it('rejects create missing required field url', async () => {
    const { url: _url, ...withoutUrl } = validDoc();
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), withoutUrl)
    );
  });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/docs — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/docs/${DOC_ID}`),
        validDoc()
      );
    });
  });

  it('member can update title and url', async () => {
    await assertSucceeds(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        ...validDoc(),
        title: 'Updated Title',
        updatedAt: 2000,
      })
    );
  });

  it('non-member cannot update a doc', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        title: 'Hacked',
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates createdBy (immutability)', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        ...validDoc(),
        createdBy: NON_MEMBER_UID,
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates createdAt (immutability)', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        ...validDoc(),
        createdAt: 9999,
        updatedAt: 2000,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/docs — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/docs/${DOC_ID}`),
        validDoc()
      );
    });
  });

  it('member can delete a doc', async () => {
    await assertSucceeds(
      deleteDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`))
    );
  });

  it('non-member cannot delete a doc', async () => {
    await assertFails(
      deleteDoc(doc(asNonMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`))
    );
  });
});
