// Firestore security rules regression coverage for `plcs/{plcId}/assessments`
// — the PLC Common Assessment object (Decision 4.0c, §3.6) — AND the adjacent
// server-only `plcs/{plcId}/aggregates` block (Decisions 6.0 + 3.3, §4).
//
// Pins:
//   - Only current PLC members can read assessments; clients can no longer
//     create, edit or delete them (plcContentWriteV1 writes them), except a
//     folder move or list-order change.
//   - Aggregates: members may READ; clients may NEVER create/update/delete
//     (writes are server-only / Admin SDK).
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

const PROJECT_ID = 'spartboard-plc-assessments-rules';
const PLC_ID = 'p1';
const ASSESSMENT_ID = 'a1';

const MEMBER_UID = 'member-uid';
const OTHER_MEMBER_UID = 'other-member-uid';
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
  // Seed the PLC doc so membership lookups resolve. Two members so the
  // PLC-owned (any-member-can-edit) posture is exercised.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID, OTHER_MEMBER_UID],
      memberEmails: {
        [MEMBER_UID]: 'member@example.com',
        [OTHER_MEMBER_UID]: 'other@example.com',
      },
      members: {
        [MEMBER_UID]: { role: 'lead' },
        [OTHER_MEMBER_UID]: { role: 'member' },
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validAssessment = (overrides: Record<string, unknown> = {}) => ({
  id: ASSESSMENT_ID,
  title: 'Unit 4 Common Formative Assessment',
  kind: 'quiz',
  syncGroupId: 'sync-group-1',
  unitLabel: 'Unit 4',
  opensAt: 1000,
  dueAt: 2000,
  status: 'planning',
  createdBy: MEMBER_UID,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const assessmentRef = (db: ReturnType<typeof asMember>) =>
  doc(db, `plcs/${PLC_ID}/assessments/${ASSESSMENT_ID}`);

const seedAssessment = async (overrides: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/assessments/${ASSESSMENT_ID}`),
      validAssessment(overrides)
    );
  });
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assessments — read', () => {
  beforeEach(() => seedAssessment());

  it('a PLC member can read an assessment', async () => {
    await assertSucceeds(getDoc(assessmentRef(asMember())));
  });

  it('a non-member cannot read an assessment (membership gate)', async () => {
    await assertFails(getDoc(assessmentRef(asNonMember())));
  });
});

// ---------------------------------------------------------------------------
// Create, edit and delete: refused for clients (plcContentWriteV1 writes them)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assessments — client writes refused', () => {
  const newRef = (db: ReturnType<typeof asMember>) =>
    doc(db, `plcs/${PLC_ID}/assessments/a2`);
  beforeEach(() => seedAssessment());

  it('a member can no longer create an assessment directly', async () => {
    await assertFails(
      setDoc(newRef(asMember()), validAssessment({ id: 'a2' }))
    );
  });

  it('a non-member cannot create an assessment either', async () => {
    await assertFails(
      setDoc(newRef(asNonMember()), validAssessment({ id: 'a2' }))
    );
  });

  it('a member can no longer edit working fields or rewrite the doc', async () => {
    await assertFails(
      updateDoc(assessmentRef(asMember()), { title: 'x', status: 'active' })
    );
    await assertFails(
      setDoc(assessmentRef(asOtherMember()), {
        ...validAssessment(),
        title: 'Unit 4 CFA (revised)',
        updatedAt: 2000,
      })
    );
  });

  it('a member can no longer soft-delete or restore through deletedAt', async () => {
    await assertFails(
      updateDoc(assessmentRef(asMember()), { deletedAt: 5000, updatedAt: 5000 })
    );
  });

  it('a non-member cannot edit', async () => {
    await assertFails(
      updateDoc(assessmentRef(asNonMember()), { title: 'x', updatedAt: 2000 })
    );
  });

  it('a member can no longer hard-delete an assessment', async () => {
    await assertFails(deleteDoc(assessmentRef(asMember())));
    await assertFails(deleteDoc(assessmentRef(asOtherMember())));
    await assertFails(deleteDoc(assessmentRef(asNonMember())));
  });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assessments — folder move and order (still direct)', () => {
  beforeEach(() => seedAssessment());

  it('allows setting folderId (PLC_ASSESSMENT_DATA §3.4)', async () => {
    await assertSucceeds(
      updateDoc(assessmentRef(asMember()), {
        folderId: 'f1',
        updatedAt: 2000,
      })
    );
  });

  it('rejects a non-string, non-null folderId', async () => {
    await assertFails(
      updateDoc(assessmentRef(asMember()), {
        folderId: 42,
        updatedAt: 2000,
      })
    );
  });

  it('allows a member to set an integer order and read it back', async () => {
    await assertSucceeds(updateDoc(assessmentRef(asMember()), { order: 3 }));
    await assertSucceeds(getDoc(assessmentRef(asMember())));
  });

  it('rejects a non-integer order', async () => {
    await assertFails(updateDoc(assessmentRef(asMember()), { order: '3' }));
    await assertFails(updateDoc(assessmentRef(asMember()), { order: 1.5 }));
  });

  it('rejects an order write from a non-member', async () => {
    await assertFails(updateDoc(assessmentRef(asNonMember()), { order: 0 }));
  });

  it('allows a folder move that clears folderId to null', async () => {
    await assertSucceeds(
      updateDoc(assessmentRef(asMember()), { folderId: null })
    );
  });

  it('rejects a folder move from a non-member', async () => {
    await assertFails(
      updateDoc(assessmentRef(asNonMember()), {
        folderId: 'f1',
        updatedAt: 2000,
      })
    );
  });

  it('rejects a title change, alone or bundled with a folder move or order', async () => {
    await assertFails(updateDoc(assessmentRef(asMember()), { title: 'x' }));
    await assertFails(
      updateDoc(assessmentRef(asMember()), { folderId: 'f1', title: 'x' })
    );
    await assertFails(
      updateDoc(assessmentRef(asMember()), { order: 1, folderId: 'f1' })
    );
  });
});

// ---------------------------------------------------------------------------
// Aggregates (server-only writes; member read-only) — §4 / Decisions 6.0+3.3
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/aggregates — member read, client writes denied', () => {
  const AGG_ID = ASSESSMENT_ID;
  const aggRef = (db: ReturnType<typeof asMember>) =>
    doc(db, `plcs/${PLC_ID}/aggregates/${AGG_ID}`);

  const validAggregate = () => ({
    assessmentId: AGG_ID,
    schemaVersion: 1,
    teacherCount: 2,
    studentCount: 40,
    teamAveragePercent: 78,
    perQuestion: [],
    perTeacher: [],
    ranAt: 1000,
  });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/aggregates/${AGG_ID}`),
        validAggregate()
      );
    });
  });

  it('a PLC member can read an aggregate', async () => {
    await assertSucceeds(getDoc(aggRef(asMember())));
  });

  it('a non-member cannot read an aggregate (membership gate)', async () => {
    await assertFails(getDoc(aggRef(asNonMember())));
  });

  it('a member CANNOT create an aggregate (server-only)', async () => {
    const freshRef = doc(asMember(), `plcs/${PLC_ID}/aggregates/fresh-agg`);
    await assertFails(
      setDoc(freshRef, { ...validAggregate(), assessmentId: 'fresh-agg' })
    );
  });

  it('a member CANNOT update an aggregate (server-only)', async () => {
    await assertFails(
      updateDoc(aggRef(asMember()), { teamAveragePercent: 99 })
    );
  });

  it('a member CANNOT delete an aggregate (server-only)', async () => {
    await assertFails(deleteDoc(aggRef(asMember())));
  });
});

// Flashcards checks: the server creates `kind: 'flashcard-check'` assessments; clients only read and edit working fields.
describe('plcs/{plcId}/assessments — flashcard-check kind', () => {
  const flashcardAssessment = () =>
    validAssessment({ kind: 'flashcard-check', syncGroupId: 'set-1' });
  const seedFlashcard = () =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/assessments/${ASSESSMENT_ID}`),
        flashcardAssessment()
      );
      await setDoc(
        doc(ctx.firestore(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`),
        { assessmentId: ASSESSMENT_ID, kind: 'flashcard-check' }
      );
    });

  it('a member reads the assessment and its aggregate', async () => {
    await seedFlashcard();
    await assertSucceeds(getDoc(assessmentRef(asMember())));
    await assertSucceeds(
      getDoc(doc(asMember(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });

  it('a non-member reads neither', async () => {
    await seedFlashcard();
    await assertFails(getDoc(assessmentRef(asNonMember())));
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });

  it('a member can file it but no longer rename or close it directly', async () => {
    await seedFlashcard();
    await assertSucceeds(
      updateDoc(assessmentRef(asOtherMember()), {
        folderId: 'f1',
        updatedAt: 3000,
      })
    );
    await assertFails(
      updateDoc(assessmentRef(asOtherMember()), {
        title: 'Unit 4 vocab',
        status: 'closed',
        updatedAt: 3000,
      })
    );
  });

  it('a member cannot turn it into a quiz assessment', async () => {
    await seedFlashcard();
    await assertFails(
      updateDoc(assessmentRef(asMember()), { kind: 'quiz', updatedAt: 3000 })
    );
  });

  it('a non-member cannot edit it', async () => {
    await seedFlashcard();
    await assertFails(
      updateDoc(assessmentRef(asNonMember()), { title: 'x', updatedAt: 3000 })
    );
  });

  it('a client cannot create one', async () => {
    await assertFails(setDoc(assessmentRef(asMember()), flashcardAssessment()));
  });

  it('a client cannot write its aggregate', async () => {
    await seedFlashcard();
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`), {
        assessmentId: ASSESSMENT_ID,
        kind: 'flashcard-check',
        teamAveragePercent: 100,
      })
    );
  });
});
