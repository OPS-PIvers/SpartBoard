// Firestore security-rules regression for the
// `/plcs/{plcId}/quizzes/{plcQuizId}` match block introduced with Phase 2
// of the PLC Dashboard (PLC Quiz Library). The rules carry the same
// invariants as Phase 1's assignment_index plus a few PLC-Library-specific
// ones:
//   - membership-gated reads
//   - clients cannot create, edit or delete an entry (plcContentWriteV1 does)
//   - the two direct writes left are a folder move (`folderId`, optional
//     `updatedAt`) and a list-order change (`order`) by an editor
//
// Requires a running Firestore emulator — invoke via
// `pnpm run test:rules` (see vitest.rules.config.ts).

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

const PROJECT_ID = 'spartboard-plc-quizzes';
const PLC_ID = 'plc-rules-test';
const PLC_QUIZ_ID = 'plc-quiz-rules-test';
const SYNC_GROUP_ID = 'group-rules-test';

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

const validEntry = (overrides: Record<string, unknown> = {}) => ({
  id: PLC_QUIZ_ID,
  title: 'My PLC Quiz',
  questionCount: 5,
  syncGroupId: SYNC_GROUP_ID,
  sharedBy: MEMBER_A_UID,
  sharedByEmail: 'member-a@example.com',
  sharedByName: 'Member A',
  sharedAt: 1000,
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
// read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/quizzes — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry()
      );
    });
  });

  it('a PLC member can read entries', async () => {
    await assertSucceeds(
      getDoc(doc(asMemberB(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`))
    );
  });

  it('a non-member cannot read entries (membership gate)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`))
    );
  });
});

// ---------------------------------------------------------------------------
// create: refused for clients (plcContentWriteV1 writes it)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/quizzes — create refused', () => {
  it('a member can no longer create an entry, with or without run-settings', async () => {
    const ref = doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`);
    await assertFails(setDoc(ref, validEntry()));
    await assertFails(
      setDoc(
        ref,
        validEntry({
          sessionMode: 'student',
          sessionOptions: { shuffleQuestions: true },
          attemptLimit: null,
          quizId: 'personal-quiz-1',
        })
      )
    );
  });

  it('a non-member cannot create an entry either', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry({ sharedBy: NON_MEMBER_UID })
      )
    );
  });
});

// ---------------------------------------------------------------------------
// update — immutability of identity + attribution fields
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/quizzes — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry()
      );
    });
  });

  it('a member can no longer change the title, count, run-settings or archive it', async () => {
    const ref = doc(asMemberB(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`);
    await assertFails(
      updateDoc(ref, { title: 'Renamed', questionCount: 9, updatedAt: 2000 })
    );
    await assertFails(
      updateDoc(ref, { sessionMode: 'student', updatedAt: 2000 })
    );
    await assertFails(updateDoc(ref, { archived: true, updatedAt: 2000 }));
  });

  it('a member cannot rewrite the doc or change attribution', async () => {
    const ref = doc(asMemberB(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`);
    await assertFails(setDoc(ref, validEntry({ title: 'Hijacked' })));
    await assertFails(updateDoc(ref, { sharedBy: MEMBER_B_UID }));
  });

  it('a non-member cannot update an entry', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        title: 'Hijacked',
      })
    );
  });

  it('rejects a title change bundled with a folder move or order', async () => {
    const ref = doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`);
    await assertFails(updateDoc(ref, { folderId: 'f1', title: 'Renamed' }));
    await assertFails(updateDoc(ref, { order: 2, title: 'Renamed' }));
  });

  it('rejects a folder move from a non-member', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        folderId: 'f1',
        updatedAt: 2000,
      })
    );
  });

  it('allows clearing folderId to null', async () => {
    await assertSucceeds(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        folderId: null,
      })
    );
  });

  it('allows setting folderId (PLC_ASSESSMENT_DATA §3.4)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        folderId: 'f1',
        updatedAt: 2000,
      })
    );
  });

  it('rejects a non-string, non-null folderId', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        folderId: 42,
        updatedAt: 2000,
      })
    );
  });

  it('allows a member to set an integer order and read it back', async () => {
    const ref = doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`);
    await assertSucceeds(updateDoc(ref, { order: 2 }));
    await assertSucceeds(getDoc(ref));
  });

  it('rejects a non-integer order', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        order: 'first',
      })
    );
  });

  it('rejects an order write from a non-member', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        order: 0,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// delete: refused for clients (plcContentWriteV1 writes it)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/quizzes — delete refused', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry()
      );
    });
  });

  it('neither the sharer nor a teammate nor a non-member can delete', async () => {
    const path = `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`;
    await assertFails(deleteDoc(doc(asMemberA(), path)));
    await assertFails(deleteDoc(doc(asMemberB(), path)));
    await assertFails(deleteDoc(doc(asNonMember(), path)));
  });
});
