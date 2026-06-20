// Firestore security-rules regression for the
// `/plcs/{plcId}/aggregates/{aggregateId}` match block (Decisions 6.0 + 3.3,
// PRD §3.6 / §4). These docs are the anonymized, PII-free per-assessment
// rollups that PLC members read in Shared Data + Meeting Mode. The rules carry
// two load-bearing invariants:
//   - membership-gated reads — any current PLC member can read an aggregate
//     (the whole point of the shared view), gated via BOTH the canonical
//     `members` map (Decision 1.2) AND the denormalized `memberUids` index so
//     a PLC carrying only one shape still authorizes its members.
//   - SERVER-ONLY writes — `allow create, update, delete: if false`. The
//     aggregation pipeline (`aggregatePlcAssessment`, Wave 3) and the one-shot
//     `migratePlcs` skeleton seed write via the Admin SDK, which bypasses
//     rules. NO client may forge or tamper with an aggregate, which is what
//     keeps the raw-contribution PII boundary intact (a member can't fabricate
//     an aggregate that smuggles named rows).
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

const PROJECT_ID = 'spartboard-plc-aggregates';
const PLC_ID = 'plc-aggregates-test';
// A PLC that carries ONLY the canonical members map (no memberUids index),
// used to prove the map-key read gate works on a fully-migrated doc.
const MAP_ONLY_PLC_ID = 'plc-aggregates-map-only';
const ASSESSMENT_ID = 'assessment-x';
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

const validAggregate = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  assessmentId: ASSESSMENT_ID,
  schemaVersion: 1,
  teacherCount: 2,
  studentCount: 40,
  teamAveragePercent: 78,
  perQuestion: [],
  perTeacher: [],
  ranAt: 1000,
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
    // Legacy-array-shaped PLC (memberUids index present).
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
    // Seed an aggregate via the Admin-SDK-equivalent (rules disabled) — this
    // is how the server pipeline writes them.
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`),
      validAggregate()
    );

    // Map-only PLC: canonical members map, NO memberUids index. Member A is a
    // map-key member; Member B is not in this PLC.
    await setDoc(doc(ctx.firestore(), `plcs/${MAP_ONLY_PLC_ID}`), {
      name: 'Map-Only PLC',
      leadUid: MEMBER_A_UID,
      members: {
        [MEMBER_A_UID]: {
          uid: MEMBER_A_UID,
          email: 'member-a@example.com',
          displayName: 'Member A',
          role: 'lead',
          status: 'active',
          joinedAt: 1,
        },
      },
      memberEmails: { [MEMBER_A_UID]: 'member-a@example.com' },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(
      doc(
        ctx.firestore(),
        `plcs/${MAP_ONLY_PLC_ID}/aggregates/${ASSESSMENT_ID}`
      ),
      validAggregate()
    );
  });
});

describe('plcs/{plcId}/aggregates — read', () => {
  it('a PLC member can read an aggregate (via memberUids index)', async () => {
    await assertSucceeds(
      getDoc(doc(asMemberA(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
    await assertSucceeds(
      getDoc(doc(asMemberB(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });

  it('a member of a map-only PLC can read via the members-map key', async () => {
    await assertSucceeds(
      getDoc(
        doc(asMemberA(), `plcs/${MAP_ONLY_PLC_ID}/aggregates/${ASSESSMENT_ID}`)
      )
    );
  });

  it('a non-member cannot read aggregates (membership gate)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });

  it('a non-member of the map-only PLC cannot read it', async () => {
    await assertFails(
      getDoc(
        doc(asMemberB(), `plcs/${MAP_ONLY_PLC_ID}/aggregates/${ASSESSMENT_ID}`)
      )
    );
  });
});

describe('plcs/{plcId}/aggregates — writes are server-only', () => {
  it('a member CANNOT create an aggregate (server-only)', async () => {
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/aggregates/new-assessment`),
        validAggregate({ assessmentId: 'new-assessment' })
      )
    );
  });

  it('the lead CANNOT create an aggregate (server-only — even the owner)', async () => {
    // Member A is the lead; the server-only rule denies even the lead so the
    // PII boundary can't be bypassed by the most-privileged member.
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/aggregates/forged`),
        validAggregate({ assessmentId: 'forged' })
      )
    );
  });

  it('a member CANNOT update an existing aggregate (server-only)', async () => {
    await assertFails(
      updateDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`),
        { teamAveragePercent: 100 }
      )
    );
  });

  it('a member CANNOT delete an aggregate (server-only)', async () => {
    await assertFails(
      deleteDoc(doc(asMemberA(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });

  it('a non-member CANNOT create an aggregate either', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`),
        validAggregate()
      )
    );
  });
});
