// Firestore security rules regression coverage for `plcs/{plcId}/docs`.
// Pins the invariants introduced in the PLC redesign Wave 1:
//   - Only current PLC members can read docs; creating, editing and deleting
//     run in plcContentWriteV1, so clients are refused.
//   - The one direct write left is a member updating only `actionItems`
//     (a list of at most 200) and `updatedAt`.
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
import {
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

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
// Create, edit and delete: refused for clients (plcContentWriteV1 writes them)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/docs — client writes refused', () => {
  const docRef = (db: ReturnType<typeof asMember>) =>
    doc(db, `plcs/${PLC_ID}/docs/${DOC_ID}`);

  it('a member can no longer create a doc', async () => {
    await assertFails(setDoc(docRef(asMember()), validDoc()));
  });

  it('a non-member cannot create a doc either', async () => {
    await assertFails(setDoc(docRef(asNonMember()), validDoc()));
  });

  describe('with an existing doc', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `plcs/${PLC_ID}/docs/${DOC_ID}`),
          validDoc()
        );
      });
    });

    it('a member can no longer change the title or url', async () => {
      await assertFails(
        updateDoc(docRef(asMember()), { title: 'Renamed', updatedAt: 2000 })
      );
      await assertFails(
        updateDoc(docRef(asMember()), { url: 'https://example.com/x' })
      );
    });

    it('a member cannot slip a title change in next to action items', async () => {
      await assertFails(
        updateDoc(docRef(asMember()), {
          title: 'Renamed',
          actionItems: [],
          updatedAt: 2000,
        })
      );
    });

    it('a member cannot rewrite identity fields', async () => {
      await assertFails(updateDoc(docRef(asMember()), { createdBy: 'x' }));
      await assertFails(updateDoc(docRef(asMember()), { createdAt: 5 }));
    });

    it('a member can no longer delete a doc', async () => {
      await assertFails(deleteDoc(docRef(asMember())));
    });

    it('a non-member cannot update or delete a doc', async () => {
      await assertFails(
        updateDoc(docRef(asNonMember()), { title: 'x', updatedAt: 2000 })
      );
      await assertFails(deleteDoc(docRef(asNonMember())));
    });
  });
});

describe('plcs/{plcId}/docs — actionItems', () => {
  const item = (n: number) => ({
    id: `a${n}`,
    text: `Item ${n}`,
    done: false,
    createdAt: 1000,
  });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        ...validDoc(),
        actionItems: [item(1)],
      });
    });
  });

  it('a member can read a doc that has action items', async () => {
    await assertSucceeds(
      getDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`))
    );
  });

  it('a non-member cannot read a doc that has action items', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`))
    );
  });

  it('a member can no longer create a doc with action items', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/docs/d2`), {
        ...validDoc({ id: 'd2' }),
        actionItems: [item(1), item(2)],
      })
    );
  });

  it('a member can update action items', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        actionItems: [item(1), item(2)],
        updatedAt: 2000,
      })
    );
  });

  it('accepts a serverTimestamp() updatedAt next to the action items', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        actionItems: [item(1)],
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('a non-member cannot update action items', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        actionItems: [],
        updatedAt: 2000,
      })
    );
  });

  it('rejects actionItems that is not a list', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        actionItems: 'nope',
        updatedAt: 2000,
      })
    );
  });

  it('rejects more than 200 action items', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}/docs/${DOC_ID}`), {
        actionItems: Array.from({ length: 201 }, (_, i) => item(i)),
        updatedAt: 2000,
      })
    );
  });
});
