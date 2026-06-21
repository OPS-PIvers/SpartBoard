// Firestore security rules regression coverage for `plcs/{plcId}/meetings`
// — the PLC Meeting record (Decisions 4.0 + 4.0b, §3.7).
//
// Pins the invariants introduced in the PLC redesign Wave 3:
//   - Only current PLC members can read/create/update/delete meetings.
//   - On create: `id` must equal the meetingId path segment, `createdBy` must
//     equal the caller's uid, `facilitatorUid` is a string, `decisions` /
//     `actionItems` / `attendeeUids` / `assessmentIds` are lists, `status`
//     ∈ {in-progress, completed}, schema is locked via `keys().hasOnly([...])`.
//   - On update: `id`, `createdBy`, `heldAt`, and `facilitatorUid` are
//     immutable; the working fields + `deletedAt` soft-delete are mutable.
//   - Soft-delete via `deletedAt` is allowed; serverTimestamp() time fields
//     dual-accept (`int || timestamp`).
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

const PROJECT_ID = 'spartboard-plc-meetings-rules';
const PLC_ID = 'p1';
const MEETING_ID = 'm1';

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

const validMeeting = (overrides: Record<string, unknown> = {}) => ({
  id: MEETING_ID,
  heldAt: 1000,
  facilitatorUid: MEMBER_UID,
  attendeeUids: [MEMBER_UID, OTHER_MEMBER_UID],
  assessmentIds: ['a1'],
  agenda: 'Review Unit 4 CFA',
  decisions: [
    {
      id: 'dec1',
      text: 'Reteach question 3',
      linkedDataCard: { assessmentId: 'a1', questionId: 'q3' },
    },
  ],
  actionItems: [
    {
      id: 'ai1',
      text: 'Build reteach slides',
      assigneeUid: OTHER_MEMBER_UID,
      dueAt: 5000,
    },
  ],
  notesBody: 'Team agreed to reteach the weakest standard.',
  status: 'in-progress',
  createdBy: MEMBER_UID,
  updatedAt: 1000,
  ...overrides,
});

const meetingRef = (db: ReturnType<typeof asMember>) =>
  doc(db, `plcs/${PLC_ID}/meetings/${MEETING_ID}`);

const seedMeeting = async (overrides: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/meetings/${MEETING_ID}`),
      validMeeting(overrides)
    );
  });
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/meetings — read', () => {
  beforeEach(() => seedMeeting());

  it('a PLC member can read a meeting', async () => {
    await assertSucceeds(getDoc(meetingRef(asMember())));
  });

  it('a non-member cannot read a meeting (membership gate)', async () => {
    await assertFails(getDoc(meetingRef(asNonMember())));
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/meetings — create', () => {
  it('member can create a meeting with the locked schema', async () => {
    await assertSucceeds(setDoc(meetingRef(asMember()), validMeeting()));
  });

  it('accepts serverTimestamp() for heldAt / updatedAt (dual-accept)', async () => {
    await assertSucceeds(
      setDoc(
        meetingRef(asMember()),
        validMeeting({
          heldAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      )
    );
  });

  it('accepts a meeting that omits the optional agenda / notesBody', async () => {
    const { agenda: _a, notesBody: _n, ...minimal } = validMeeting();
    await assertSucceeds(setDoc(meetingRef(asMember()), minimal));
  });

  it('accepts a completed meeting with empty decisions / actionItems lists', async () => {
    await assertSucceeds(
      setDoc(
        meetingRef(asMember()),
        validMeeting({ decisions: [], actionItems: [], status: 'completed' })
      )
    );
  });

  it('non-member cannot create a meeting', async () => {
    await assertFails(
      setDoc(
        meetingRef(asNonMember()),
        validMeeting({ createdBy: NON_MEMBER_UID })
      )
    );
  });

  it('rejects create when id field does not match meetingId path segment', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), validMeeting({ id: 'different-id' }))
    );
  });

  it('rejects create when createdBy does not match caller uid', async () => {
    await assertFails(
      setDoc(
        meetingRef(asMember()),
        validMeeting({ createdBy: OTHER_MEMBER_UID })
      )
    );
  });

  it('rejects create with an unknown status', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), validMeeting({ status: 'cancelled' }))
    );
  });

  it('rejects create when decisions is not a list', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), validMeeting({ decisions: 'nope' }))
    );
  });

  it('rejects create when attendeeUids is not a list', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), validMeeting({ attendeeUids: 'nope' }))
    );
  });

  it('rejects create with an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), {
        ...validMeeting(),
        unexpected: 'extra-field',
      })
    );
  });

  it('rejects create missing required field facilitatorUid', async () => {
    const { facilitatorUid: _f, ...without } = validMeeting();
    await assertFails(setDoc(meetingRef(asMember()), without));
  });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/meetings — update', () => {
  beforeEach(() => seedMeeting());

  it('member can update working fields (status, decisions, actionItems)', async () => {
    await assertSucceeds(
      updateDoc(meetingRef(asMember()), {
        status: 'completed',
        decisions: [],
        actionItems: [],
        updatedAt: 2000,
      })
    );
  });

  it('any member (PLC-owned) can update a meeting they did not create', async () => {
    await assertSucceeds(
      updateDoc(meetingRef(asOtherMember()), {
        status: 'completed',
        updatedAt: 2000,
      })
    );
  });

  it('accepts a serverTimestamp() updatedAt patch (dual-accept)', async () => {
    await assertSucceeds(
      updateDoc(meetingRef(asMember()), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('member can soft-delete via deletedAt', async () => {
    await assertSucceeds(
      updateDoc(meetingRef(asMember()), {
        deletedAt: serverTimestamp(),
        updatedAt: 2000,
      })
    );
  });

  it('member can restore (clear deletedAt to null)', async () => {
    await seedMeeting({ deletedAt: 5000 });
    await assertSucceeds(
      updateDoc(meetingRef(asMember()), {
        deletedAt: null,
        updatedAt: 2000,
      })
    );
  });

  it('non-member cannot update a meeting', async () => {
    await assertFails(
      updateDoc(meetingRef(asNonMember()), {
        status: 'completed',
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates createdBy (identity immutability)', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), {
        ...validMeeting(),
        createdBy: OTHER_MEMBER_UID,
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates heldAt (immutability)', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), {
        ...validMeeting(),
        heldAt: 9999,
        updatedAt: 2000,
      })
    );
  });

  it('rejects update that mutates facilitatorUid (immutability)', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), {
        ...validMeeting(),
        facilitatorUid: OTHER_MEMBER_UID,
        updatedAt: 2000,
      })
    );
  });

  it('rejects update to an unknown status', async () => {
    await assertFails(
      updateDoc(meetingRef(asMember()), {
        status: 'cancelled',
        updatedAt: 2000,
      })
    );
  });

  it('rejects update adding an extra unknown field (schema lock-down)', async () => {
    await assertFails(
      setDoc(meetingRef(asMember()), {
        ...validMeeting(),
        rogue: true,
        updatedAt: 2000,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/meetings — delete', () => {
  beforeEach(() => seedMeeting());

  it('member can hard-delete a meeting', async () => {
    await assertSucceeds(deleteDoc(meetingRef(asMember())));
  });

  it('any member (PLC-owned) can delete a meeting they did not create', async () => {
    await assertSucceeds(deleteDoc(meetingRef(asOtherMember())));
  });

  it('non-member cannot delete a meeting', async () => {
    await assertFails(deleteDoc(meetingRef(asNonMember())));
  });
});
