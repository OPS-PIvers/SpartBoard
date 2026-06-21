// Firestore security-rules regression for the
// `/plcs/{plcId}/contributions/{contribId}` match block — the
// Firestore-native replacement for the Google-Sheet-based PLC aggregate.
// The rules carry a few load-bearing invariants:
//   - OWNER-ONLY reads (the FERPA boundary, tightened in Wave 3 per PRD
//     §3.6 step 2 / §9 PII risk row): a contribution's raw `responses[]`
//     embed `studentDisplayName`, so only the owning teacher may read her
//     own contribution. A co-member is DENIED — cross-teacher rollups go
//     through the anonymized `/aggregates` sibling instead. The `read`
//     describe block pins this: owner reads own, co-member denied,
//     non-member denied (owner-only is strictly narrower than the prior
//     member-only gate, never wider). Deeper PII-specific coverage —
//     proving the denied co-member never sees another teacher's student
//     names while still reading aggregates — lives in
//     `plcContributionsPii.test.ts`.
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

// A contribution `responses[]` entry carrying student PII. The
// `studentDisplayName` field is the raw FERPA-protected datum that the
// Wave 3 read-tightening (member-read -> owner-only, PRD §3.6 step 2 /
// §5 risk row) exists to wall off from other teachers. We seed it here so
// the Wave 0 characterization asserts behavior over the *actual* PII, not
// an empty `responses` array.
const piiResponse = (studentDisplayName: string): Record<string, unknown> => ({
  studentDisplayName,
  pin: '0001',
  classPeriod: '',
  status: 'completed',
  scorePercent: 100,
  pointsEarned: 1,
  maxPoints: 1,
  tabSwitchWarnings: 0,
  submittedAt: 2000,
  pointsByQuestionId: { q1: 1 },
});

describe('plcs/{plcId}/contributions — read (owner-only)', () => {
  // Seed BOTH members' contribution docs, each holding a distinct
  // student name. This pins the single most security-critical rule in
  // the PRD: post-Wave-3 the read is OWNER-ONLY — a co-member is denied
  // another teacher's raw student names, while the owner still reads her
  // own. Cross-teacher data flows through the anonymized /aggregates.
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
        validContribution({
          responses: [piiResponse('Alice Owner-A')],
        })
      );
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_B}`),
        validContribution({
          id: CONTRIB_ID_B,
          teacherUid: MEMBER_B_UID,
          teacherName: 'Member B',
          responses: [piiResponse('Bob Owner-B')],
        })
      );
    });
  });

  it('the owning member can read her own contribution (incl. raw responses[])', async () => {
    // Owner-read is the post-Wave-3 floor and must stay TRUE across the
    // tightening — pinned here so the flip can't accidentally lock the
    // owner out of her own data.
    await assertSucceeds(
      getDoc(doc(asMemberA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`))
    );
  });

  // FERPA boundary (Wave 3, PRD §3.6 step 2 / §9 PII risk row). A
  // non-owning PLC member must NOT read another teacher's raw
  // contribution, whose `responses[]` embed `studentDisplayName`. The
  // read rule is owner-only (`resource.data.teacherUid == auth.uid`), so
  // member B is denied member A's doc.
  it('a non-owning PLC member CANNOT read another teacher’s raw contribution (owner-only — FERPA)', async () => {
    await assertFails(
      getDoc(doc(asMemberB(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`))
    );
  });

  // Pins the membership gate so the owner-only change can't accidentally
  // widen reads back to "any authenticated user". A non-member is denied
  // — owner-only is strictly narrower than member-only, never wider.
  it('a non-member cannot read contributions (owner-only is strictly narrower than the old member gate)', async () => {
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
