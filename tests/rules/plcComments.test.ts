// Firestore security rules regression coverage for `plcs/{plcId}/comments`.
// Pins the Wave-2 comment invariants (Decision 2.6, §3.5):
//   - Any current PLC member can read comments.
//   - Create and update are server-only (plcNotesWriteV1): clients are refused.
//   - Hard delete is server-only (GC).
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

const PROJECT_ID = 'spartboard-plc-comments-rules';
const PLC_ID = 'p1';
const COMMENT_ID = 'c1';

const AUTHOR_UID = 'author-uid';
const MEMBER2_UID = 'member2-uid';
const NON_MEMBER_UID = 'non-member-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAuthor = () =>
  testEnv
    .authenticatedContext(AUTHOR_UID, { email: 'author@example.com' })
    .firestore();

const asMember2 = () =>
  testEnv
    .authenticatedContext(MEMBER2_UID, { email: 'member2@example.com' })
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: AUTHOR_UID,
      memberUids: [AUTHOR_UID, MEMBER2_UID],
      memberEmails: {
        [AUTHOR_UID]: 'author@example.com',
        [MEMBER2_UID]: 'member2@example.com',
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

const validComment = (overrides: Record<string, unknown> = {}) => ({
  id: COMMENT_ID,
  targetType: 'dataCard',
  targetId: 'assessment1:q3',
  authorUid: AUTHOR_UID,
  authorName: 'Author Teacher',
  body: 'This question tanked.',
  mentions: [MEMBER2_UID],
  createdAt: 1000,
  ...overrides,
});

const seedComment = async (overrides: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/comments/${COMMENT_ID}`),
      validComment(overrides)
    );
  });
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/comments — read', () => {
  beforeEach(() => seedComment());

  it('a member can read a comment', async () => {
    await assertSucceeds(
      getDoc(doc(asMember2(), `plcs/${PLC_ID}/comments/${COMMENT_ID}`))
    );
  });

  it('a non-member cannot read a comment (membership gate)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/comments/${COMMENT_ID}`))
    );
  });
});

// ---------------------------------------------------------------------------
// Create and update: refused for clients (plcNotesWriteV1 writes them)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/comments — client writes refused', () => {
  const commentRef = (db: ReturnType<typeof asAuthor>) =>
    doc(db, `plcs/${PLC_ID}/comments/${COMMENT_ID}`);

  it('a member can no longer create a comment authored by themselves', async () => {
    await assertFails(setDoc(commentRef(asAuthor()), validComment()));
  });

  it('a non-member cannot create a comment either', async () => {
    await assertFails(setDoc(commentRef(asNonMember()), validComment()));
  });

  describe('with an existing comment', () => {
    beforeEach(() => seedComment());

    it('the author can no longer edit the body or soft-delete', async () => {
      await assertFails(
        updateDoc(commentRef(asAuthor()), { body: 'edited', editedAt: 2000 })
      );
      await assertFails(updateDoc(commentRef(asAuthor()), { deletedAt: 2000 }));
    });

    it('a non-author member can no longer soft-delete', async () => {
      await assertFails(
        updateDoc(commentRef(asMember2()), { deletedAt: 2000 })
      );
    });

    it('a non-member cannot update a comment', async () => {
      await assertFails(
        updateDoc(commentRef(asNonMember()), { deletedAt: 2000 })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Hard delete — never allowed (server-only; clients soft-delete)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/comments — hard delete denied', () => {
  beforeEach(() => seedComment());

  it('the author cannot hard-delete a comment', async () => {
    await assertFails(
      deleteDoc(doc(asAuthor(), `plcs/${PLC_ID}/comments/${COMMENT_ID}`))
    );
  });

  it('a non-member cannot hard-delete a comment', async () => {
    await assertFails(
      deleteDoc(doc(asNonMember(), `plcs/${PLC_ID}/comments/${COMMENT_ID}`))
    );
  });
});
