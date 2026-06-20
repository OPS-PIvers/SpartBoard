// Firestore security-rules regression for the
// `/plcs/{plcId}/quizzes/{plcQuizId}` match block introduced with Phase 2
// of the PLC Dashboard (PLC Quiz Library). The rules carry the same
// invariants as Phase 1's assignment_index plus a few PLC-Library-specific
// ones:
//   - membership-gated reads
//   - ANY member can create / update / delete (PLC-owned model — quizzes
//     shared with the PLC belong to the PLC, not the original sharer)
//   - schema lock-down (`keys().hasOnly([...])`)
//   - identity + attribution fields immutable on update (`id`,
//     `syncGroupId`, `sharedBy`, `sharedByEmail`, `sharedByName`,
//     `sharedAt`)
//   - `sharedBy` must equal the caller on create (no impersonation)
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
// create
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/quizzes — create', () => {
  it('any PLC member can create a valid entry', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry()
      )
    );
  });

  it('a non-member cannot fabricate an entry', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry({ sharedBy: NON_MEMBER_UID })
      )
    );
  });

  it('rejects when sharedBy != caller (no impersonation)', async () => {
    // The PLC tab displays sharedByName/Email from this snapshot — an
    // impersonation would mislead other members about who shared the
    // quiz, undermining the audit trail.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry({ sharedBy: MEMBER_B_UID })
      )
    );
  });

  it('rejects when path id != entry.id (path/payload mismatch)', async () => {
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/quizzes/different-id`),
        validEntry({ id: PLC_QUIZ_ID })
      )
    );
  });

  it('rejects extra unknown fields (schema lock-down)', async () => {
    // Closed schema — future readers shouldn't have to defensively parse
    // unexpected payloads. Drift here would also smuggle bloat past the
    // rule that should reject it.
    await assertFails(
      setDoc(doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        ...validEntry(),
        unexpected: 'extra',
      })
    );
  });

  it('rejects when questionCount is negative', async () => {
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry({ questionCount: -1 })
      )
    );
  });

  it('rejects when syncGroupId is missing/non-string', async () => {
    // Without syncGroupId the entry can't participate in collaborative
    // editing — the PLC tab would render an unactionable row.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry({ syncGroupId: 42 })
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

  it('any member can mirror title/questionCount/updatedAt (collaborative-edit posture)', async () => {
    // Phase 5 notes/todos gives any member edit rights. Phase 2 quizzes
    // mirror that — title and questionCount are bumped after each peer
    // publishes a content edit, so any current member must be able to
    // patch them. If this assertion ever flips, the LWW mirror would
    // start failing for non-sharer peers.
    await assertSucceeds(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        title: 'Renamed',
        questionCount: 9,
        updatedAt: 2000,
      })
    );
  });

  it('rejects an attempt to change syncGroupId (immutability)', async () => {
    // The syncGroupId pins this PLC entry to a specific canonical
    // synced_quizzes doc. Letting a member retarget the linkage would
    // silently swap one quiz for another behind teammates' backs.
    await assertFails(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        syncGroupId: 'different-group',
      })
    );
  });

  it('rejects an attempt to change sharedBy (attribution immutability)', async () => {
    // The PLC tab renders "shared by {sharedByName}" — rewriting this
    // would let a teammate steal authorship of someone else's share.
    await assertFails(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        sharedBy: MEMBER_B_UID,
      })
    );
  });

  it('rejects an attempt to mutate id (immutability)', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        id: 'different-id',
      })
    );
  });

  it('rejects an attempt to mutate sharedAt (immutability)', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        sharedAt: 9999999,
      })
    );
  });

  it('rejects an update that introduces an extra field (schema lock-down)', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        unexpected: 'extra-field',
      })
    );
  });

  it('a non-member cannot update an entry', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`), {
        title: 'Hijacked',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// delete — orphan-tolerant, any-member
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/quizzes — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`),
        validEntry()
      );
    });
  });

  it('the original sharer can unshare', async () => {
    await assertSucceeds(
      deleteDoc(doc(asMemberA(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`))
    );
  });

  it('any teammate (not just the sharer) can unshare (PLC-owned model)', async () => {
    // Phase 2 spec: quizzes shared with the PLC belong to the PLC, not
    // the original sharer. If this flips to assertFails, the unshare
    // affordance must hide for non-sharer rows in PlcQuizLibraryBody.
    await assertSucceeds(
      deleteDoc(doc(asMemberB(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`))
    );
  });

  it('a non-member cannot delete', async () => {
    await assertFails(
      deleteDoc(doc(asNonMember(), `plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`))
    );
  });
});
