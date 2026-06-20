// Firestore security rules regression coverage for `plcs/{plcId}/assessments`
// — the PLC Common Assessment object (Decision 4.0c, §3.6) — AND the adjacent
// server-only `plcs/{plcId}/aggregates` block (Decisions 6.0 + 3.3, §4).
//
// Pins the invariants introduced in the PLC redesign Wave 3:
//   - Only current PLC members can read/create/update/delete assessments.
//   - On create: `id` must equal the assessmentId path segment, `createdBy`
//     must equal the caller's uid, `kind` ∈ {quiz, video-activity}, `status`
//     ∈ {planning, active, reviewing, closed}, `syncGroupId` is a non-empty
//     string, schema is locked via `keys().hasOnly([...])`.
//   - On update: `id`, `createdBy`, `createdAt`, `kind`, and `syncGroupId` are
//     immutable; the working fields + `deletedAt` soft-delete are mutable.
//   - Soft-delete via `deletedAt` is allowed; serverTimestamp() time fields
//     dual-accept (`int || timestamp`).
//   - Non-members cannot read or write.
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
import {
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

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
// Create
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assessments — create', () => {
  it('member can create an assessment with the locked schema', async () => {
    await assertSucceeds(setDoc(assessmentRef(asMember()), validAssessment()));
  });

  it('member can create a video-activity assessment', async () => {
    await assertSucceeds(
      setDoc(
        assessmentRef(asMember()),
        validAssessment({ kind: 'video-activity' })
      )
    );
  });

  it('accepts serverTimestamp() for createdAt / updatedAt (dual-accept)', async () => {
    await assertSucceeds(
      setDoc(
        assessmentRef(asMember()),
        validAssessment({
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      )
    );
  });

  it('accepts null opensAt / dueAt (optional, nullable scheduling fields)', async () => {
    await assertSucceeds(
      setDoc(
        assessmentRef(asMember()),
        validAssessment({ opensAt: null, dueAt: null })
      )
    );
  });

  it('accepts an assessment that omits the optional scheduling fields', async () => {
    const {
      unitLabel: _u,
      opensAt: _o,
      dueAt: _d,
      ...minimal
    } = validAssessment();
    await assertSucceeds(setDoc(assessmentRef(asMember()), minimal));
  });

  it('non-member cannot create an assessment', async () => {
    await assertFails(
      setDoc(
        assessmentRef(asNonMember()),
        validAssessment({ createdBy: NON_MEMBER_UID })
      )
    );
  });

  it('rejects create when id field does not match assessmentId path segment', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), validAssessment({ id: 'different-id' }))
    );
  });

  it('rejects create when createdBy does not match caller uid', async () => {
    await assertFails(
      setDoc(
        assessmentRef(asMember()),
        validAssessment({ createdBy: OTHER_MEMBER_UID })
      )
    );
  });

  it('rejects create with an unknown kind', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), validAssessment({ kind: 'essay' }))
    );
  });

  it('rejects create with an unknown status', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), validAssessment({ status: 'archived' }))
    );
  });

  it('rejects create with an empty syncGroupId', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), validAssessment({ syncGroupId: '' }))
    );
  });

  it('rejects create with an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), {
        ...validAssessment(),
        unexpected: 'extra-field',
      })
    );
  });

  it('rejects create missing required field title', async () => {
    const { title: _title, ...withoutTitle } = validAssessment();
    await assertFails(setDoc(assessmentRef(asMember()), withoutTitle));
  });

  it('rejects create missing required field status', async () => {
    const { status: _status, ...withoutStatus } = validAssessment();
    await assertFails(setDoc(assessmentRef(asMember()), withoutStatus));
  });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assessments — update', () => {
  beforeEach(() => seedAssessment());

  it('member can update title and status (working fields)', async () => {
    await assertSucceeds(
      setDoc(assessmentRef(asMember()), {
        ...validAssessment(),
        title: 'Unit 4 CFA (revised)',
        status: 'active',
        updatedAt: 2000,
      })
    );
  });

  it('any member (PLC-owned) can update an assessment they did not create', async () => {
    await assertSucceeds(
      updateDoc(assessmentRef(asOtherMember()), {
        status: 'reviewing',
        updatedAt: 2000,
      })
    );
  });

  it('accepts a serverTimestamp() updatedAt patch (dual-accept)', async () => {
    await assertSucceeds(
      updateDoc(assessmentRef(asMember()), {
        status: 'active',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('member can soft-delete via deletedAt', async () => {
    await assertSucceeds(
      updateDoc(assessmentRef(asMember()), {
        deletedAt: serverTimestamp(),
        updatedAt: 2000,
      })
    );
  });

  it('member can restore (clear deletedAt to null)', async () => {
    await seedAssessment({ deletedAt: 5000 });
    await assertSucceeds(
      updateDoc(assessmentRef(asMember()), {
        deletedAt: null,
        updatedAt: 2000,
      })
    );
  });

  it('non-member cannot update an assessment', async () => {
    await assertFails(
      updateDoc(assessmentRef(asNonMember()), {
        title: 'Hacked',
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates createdBy (identity immutability)', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), {
        ...validAssessment(),
        createdBy: OTHER_MEMBER_UID,
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates createdAt (identity immutability)', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), {
        ...validAssessment(),
        createdAt: 9999,
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates kind (content type immutability)', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), {
        ...validAssessment(),
        kind: 'video-activity',
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates syncGroupId (content pointer immutability)', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), {
        ...validAssessment(),
        syncGroupId: 'sync-group-2',
        updatedAt: 2000,
      })
    );
  });

  it('rejects update to an unknown status', async () => {
    await assertFails(
      updateDoc(assessmentRef(asMember()), {
        status: 'archived',
        updatedAt: 2000,
      })
    );
  });

  it('rejects update adding an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(assessmentRef(asMember()), {
        ...validAssessment(),
        rogue: true,
        updatedAt: 2000,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/assessments — delete', () => {
  beforeEach(() => seedAssessment());

  it('member can hard-delete an assessment', async () => {
    await assertSucceeds(deleteDoc(assessmentRef(asMember())));
  });

  it('any member (PLC-owned) can delete an assessment they did not create', async () => {
    await assertSucceeds(deleteDoc(assessmentRef(asOtherMember())));
  });

  it('non-member cannot delete an assessment', async () => {
    await assertFails(deleteDoc(assessmentRef(asNonMember())));
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
