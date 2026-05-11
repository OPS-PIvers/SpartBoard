// Firestore security-rules regression for the
// `/plcs/{plcId}/contributions/{contribId}` match block — the
// Firestore-native replacement for the Google-Sheet-based PLC aggregate.
// The rules carry a few load-bearing invariants:
//   - membership-gated reads (everyone in the PLC sees every contribution)
//   - author-only writes (a member can only write her own teacherUid)
//   - doc id pinned to `{quizId}_{teacherUid}` so a teammate can't write
//     into someone else's slot
//   - schema lock-down via `keys().hasOnly([...])`
//   - identity-field immutability on update (`quizId`, `syncGroupId`,
//     `teacherUid`, `schemaVersion`) — without this a teacher could
//     silently retarget her contribution to a different quiz, corrupting
//     every viewer's aggregate
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

const PROJECT_ID = 'spartboard-plc-contributions';
const PLC_ID = 'plc-contrib-test';
const QUIZ_ID = 'quiz-x';
const MEMBER_A_UID = 'member-a-uid';
const MEMBER_B_UID = 'member-b-uid';
const NON_MEMBER_UID = 'non-member-uid';
const CONTRIB_ID_A = `${QUIZ_ID}_${MEMBER_A_UID}`;
const CONTRIB_ID_B = `${QUIZ_ID}_${MEMBER_B_UID}`;

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

const validContribution = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  id: CONTRIB_ID_A,
  schemaVersion: 1,
  quizId: QUIZ_ID,
  syncGroupId: 'sync-group-1',
  teacherUid: MEMBER_A_UID,
  teacherName: 'Member A',
  questionsSnapshot: [{ id: 'q1', text: 'Q1', points: 1 }],
  responses: [],
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

describe('plcs/{plcId}/contributions — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        validContribution()
      );
    });
  });

  it('any PLC member can read every contribution (cross-teacher aggregate)', async () => {
    await assertSucceeds(
      getDoc(doc(asMemberB(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`))
    );
  });

  it('a non-member cannot read contributions', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`))
    );
  });
});

describe('plcs/{plcId}/contributions — create', () => {
  it('a PLC member can create her own contribution with a valid payload', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        validContribution()
      )
    );
  });

  it('a non-member cannot create a contribution', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        validContribution({ teacherUid: NON_MEMBER_UID })
      )
    );
  });

  it("a member cannot create a contribution under another member's teacherUid (writes their teacherUid only)", async () => {
    // Member A trying to write a doc that claims teacherUid=B. Without this
    // check, a teammate could overwrite my contribution with bogus data.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_B}`),
        validContribution({ id: CONTRIB_ID_B, teacherUid: MEMBER_B_UID })
      )
    );
  });

  it('doc id is pinned to `{quizId}_{teacherUid}` — mismatched ids are rejected', async () => {
    // Same teacherUid, but the doc id doesn't match the quizId_uid pattern.
    // Anti-spoof: prevents writing one teacher's contribution into a slot
    // keyed for a different quiz.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/contributions/some-arbitrary-id`),
        validContribution({ id: 'some-arbitrary-id' })
      )
    );
  });

  it('unexpected fields are rejected by the schema lock-down', async () => {
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        validContribution({ stowaway: 'evil' })
      )
    );
  });
});

describe('plcs/{plcId}/contributions — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        validContribution()
      );
    });
  });

  it('the owner can update mutable fields (teacherName, responses, updatedAt)', async () => {
    await assertSucceeds(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        {
          teacherName: 'Member A (Renamed)',
          responses: [
            {
              studentDisplayName: 'Test',
              pin: '0001',
              classPeriod: '',
              status: 'completed',
              scorePercent: 100,
              pointsEarned: 1,
              maxPoints: 1,
              tabSwitchWarnings: 0,
              submittedAt: 2000,
              pointsByQuestionId: { q1: 1 },
            },
          ],
          updatedAt: 2000,
        }
      )
    );
  });

  it('a different PLC member cannot update someone else’s contribution', async () => {
    await assertFails(
      updateDoc(
        doc(asMemberB(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        { teacherName: 'B took over A', updatedAt: 2000 }
      )
    );
  });

  it('quizId is immutable on update — preventing silent retargeting', async () => {
    await assertFails(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        { quizId: 'different-quiz', updatedAt: 2000 }
      )
    );
  });

  it('teacherUid is immutable on update — preventing identity swap', async () => {
    await assertFails(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        { teacherUid: MEMBER_B_UID, updatedAt: 2000 }
      )
    );
  });
});

describe('plcs/{plcId}/contributions — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        validContribution()
      );
    });
  });

  it('owner can delete her own contribution', async () => {
    await assertSucceeds(
      deleteDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`)
      )
    );
  });

  it('another member cannot delete someone else’s contribution', async () => {
    await assertFails(
      deleteDoc(
        doc(asMemberB(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`)
      )
    );
  });

  it('a non-member cannot delete contributions (membership-gate on delete)', async () => {
    // Consistent with read/create/update — every write to this
    // subcollection requires current PLC membership. Removed-member
    // cleanup is the PLC removal flow's responsibility, not the removed
    // member's client.
    await assertFails(
      deleteDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`)
      )
    );
  });

  it('doc id pinned to `{quizId}_{teacherUid}` is enforced on delete (defense-in-depth)', async () => {
    // Seed a doc whose id doesn't match the canonical pattern (simulates
    // a migration-script write or an admin-tool entry). Even though
    // Member A's uid matches the `teacherUid` field, the mismatched id
    // blocks the delete.
    const oddId = 'arbitrary-legacy-id';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/contributions/${oddId}`),
        validContribution({ id: oddId })
      );
    });
    await assertFails(
      deleteDoc(doc(asMemberA(), `plcs/${PLC_ID}/contributions/${oddId}`))
    );
  });
});
