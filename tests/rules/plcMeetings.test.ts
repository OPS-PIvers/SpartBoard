// Firestore security rules regression coverage for `plcs/{plcId}/meetings`
// — the PLC Meeting record (Decisions 4.0 + 4.0b, §3.7).
//
// Pins:
//   - Only current PLC members can read meetings.
//   - Create and update are server-only (plcNotesWriteV1): clients are refused.
//   - Hard delete stays a direct member write (the shared delete rule).
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
// Create and update: refused for clients (plcNotesWriteV1 writes them)
// ---------------------------------------------------------------------------

describe('plcs/{plcId}/meetings — client writes refused', () => {
  it('a member can no longer create a meeting', async () => {
    await assertFails(setDoc(meetingRef(asMember()), validMeeting()));
  });

  it('a non-member cannot create a meeting either', async () => {
    await assertFails(setDoc(meetingRef(asNonMember()), validMeeting()));
  });

  describe('with an existing meeting', () => {
    beforeEach(() => seedMeeting());

    it('any member can no longer update working fields', async () => {
      await assertFails(
        updateDoc(meetingRef(asMember()), {
          status: 'completed',
          decisions: [],
          actionItems: [],
          updatedAt: 2000,
        })
      );
      await assertFails(
        updateDoc(meetingRef(asOtherMember()), { agenda: 'x', updatedAt: 2000 })
      );
    });

    it('a member can no longer soft-delete or restore', async () => {
      await assertFails(
        updateDoc(meetingRef(asMember()), { deletedAt: 2000, updatedAt: 2000 })
      );
      await assertFails(
        updateDoc(meetingRef(asMember()), { deletedAt: null, updatedAt: 2000 })
      );
    });

    it('a non-member cannot update a meeting', async () => {
      await assertFails(
        updateDoc(meetingRef(asNonMember()), { status: 'completed' })
      );
    });
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
