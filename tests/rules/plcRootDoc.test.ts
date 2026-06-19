// Firestore rules regression coverage for the PLC *root doc*
// (`plcs/{plcId}`) update branches. The subcollection surfaces (notes,
// todos, assignment_index, etc.) are covered elsewhere; this suite pins the
// security invariants on the membership-bearing root document itself —
// the branches that the broad lead-update guard sits alongside in
// `firestore.rules` (~L1455-1587):
//
//   - isAcceptingPlcInvite: a non-member with a matching *pending*
//     `plc_invitations/<plcId>_<emailLower>` doc may self-append to
//     memberUids + memberEmails (and nothing else). No pending invite →
//     rejected. Rewriting another member or touching name/leadUid →
//     rejected.
//   - isLeavingPlc: a non-lead member may self-remove (dropping only
//     themselves). Evicting a teammate → rejected. The lead leaving →
//     rejected (the "lead cannot vacate without transfer" invariant).
//   - isSettingPlcSharedSheetUrl: any member may set null→string,
//     string→null, or idempotent string→same. string→DIFFERENT string →
//     rejected (don't orphan a teammate's cached sheet). A diff that also
//     touches a non-sheet field → rejected.
//   - isUpdatingPlcFeatures: any member may toggle the `features` map
//     (diff limited to features/updatedAt). Smuggling a membership /
//     leadership change → rejected.
//   - Lead broad-update branch: the lead may rename / add a member, but
//     CANNOT change leadUid or drop themselves from memberUids (the
//     explicit lead-can't-vacate guard).
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
import { setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-root-doc';
const PLC_ID = 'plc-root-doc-test';

const MEMBER_A_UID = 'member-a-uid';
const MEMBER_A_EMAIL = 'member-a@example.com';
const MEMBER_B_UID = 'member-b-uid';
const MEMBER_B_EMAIL = 'member-b@example.com';
const NON_MEMBER_UID = 'non-member-uid';
const NON_MEMBER_EMAIL = 'newcomer@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMemberA = () =>
  testEnv
    .authenticatedContext(MEMBER_A_UID, { email: MEMBER_A_EMAIL })
    .firestore();
const asMemberB = () =>
  testEnv
    .authenticatedContext(MEMBER_B_UID, { email: MEMBER_B_EMAIL })
    .firestore();
const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: NON_MEMBER_EMAIL })
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

// The base root doc mirrors the shape the existing PLC suites seed:
// leadUid + memberUids + memberEmails (+ name / createdAt / updatedAt).
// Member A is the lead; A and B are members; the non-member is not yet in.
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_A_UID,
      memberUids: [MEMBER_A_UID, MEMBER_B_UID],
      memberEmails: {
        [MEMBER_A_UID]: MEMBER_A_EMAIL,
        [MEMBER_B_UID]: MEMBER_B_EMAIL,
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// Helper: seed a pending invitation doc keyed `<plcId>_<emailLower>` so the
// isAcceptingPlcInvite get() lookup resolves. The accept rule only reads
// `status`, so the rest of the invite shape is illustrative.
const seedPendingInvite = async (emailLower: string, status = 'pending') => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `plc_invitations/${PLC_ID}_${emailLower}`),
      {
        plcId: PLC_ID,
        email: emailLower,
        invitedBy: MEMBER_A_UID,
        status,
        createdAt: 1,
      }
    );
  });
};

// ---------------------------------------------------------------------------
// isAcceptingPlcInvite — a non-member self-adds via a pending invite
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — isAcceptingPlcInvite', () => {
  it('a non-member with a pending invite can self-append to members', async () => {
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertSucceeds(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID, MEMBER_B_UID, NON_MEMBER_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects self-add when no pending invite exists', async () => {
    // No invitation doc seeded — the get() in isAcceptingPlcInvite fails.
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID, MEMBER_B_UID, NON_MEMBER_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects self-add when the invite is not pending (already accepted)', async () => {
    await seedPendingInvite(NON_MEMBER_EMAIL, 'accepted');
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID, MEMBER_B_UID, NON_MEMBER_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects when the update also evicts an existing member', async () => {
    // Pending invite is present, but the accept-update drops Member B in
    // addition to appending the newcomer — newMembers.size() must equal
    // oldMembers.size() + 1 and must retain all old members.
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID, NON_MEMBER_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects when the update also rewrites a non-membership field (name)', async () => {
    // Even with a valid self-append, the diff must touch only
    // memberUids / memberEmails / updatedAt — renaming the PLC is not
    // an invitee's prerogative.
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID, MEMBER_B_UID, NON_MEMBER_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        name: 'Hijacked PLC name',
        updatedAt: 2,
      })
    );
  });

  it('rejects when the update tries to seize leadership', async () => {
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID, MEMBER_B_UID, NON_MEMBER_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        leadUid: NON_MEMBER_UID,
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isLeavingPlc — a non-lead member self-removes
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — isLeavingPlc', () => {
  it('a non-lead member can self-remove (drops only themselves)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects when the leaver also tries to evict another member', async () => {
    // Member B removes both themselves AND the lead — size drops by 2 and
    // the retained set is missing the lead, so isLeavingPlc fails.
    await assertFails(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        memberUids: [],
        memberEmails: {},
        updatedAt: 2,
      })
    );
  });

  it('rejects when the leaving member is the lead (no vacate without transfer)', async () => {
    // The lead (Member A) cannot self-remove through the leave path — they
    // must transfer leadership first or delete the PLC outright.
    await assertFails(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_B_UID],
        memberEmails: {
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a non-member trying to drive the leave path', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isSettingPlcSharedSheetUrl — any member sets/clears the shared sheet URL
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — isSettingPlcSharedSheetUrl', () => {
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123/edit';
  const OTHER_URL = 'https://docs.google.com/spreadsheets/d/xyz789/edit';

  // Re-seed with an existing sharedSheetUrl for the string→* transitions.
  const seedWithSheetUrl = async (url: string | null) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        name: 'Test PLC',
        leadUid: MEMBER_A_UID,
        memberUids: [MEMBER_A_UID, MEMBER_B_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
        },
        sharedSheetUrl: url,
        createdAt: 1,
        updatedAt: 1,
      });
    });
  };

  it('a member can set null/absent → string (first member seeds the URL)', async () => {
    // Base seed has no sharedSheetUrl field at all (absent → string).
    await assertSucceeds(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        sharedSheetUrl: SHEET_URL,
        updatedAt: 2,
      })
    );
  });

  it('a member can clear string → null', async () => {
    await seedWithSheetUrl(SHEET_URL);
    await assertSucceeds(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        sharedSheetUrl: null,
        updatedAt: 2,
      })
    );
  });

  it('a member can idempotently re-set string → same string', async () => {
    await seedWithSheetUrl(SHEET_URL);
    await assertSucceeds(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        sharedSheetUrl: SHEET_URL,
        updatedAt: 2,
      })
    );
  });

  it('rejects overwriting string → DIFFERENT string (no orphaning teammates)', async () => {
    await seedWithSheetUrl(SHEET_URL);
    await assertFails(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        sharedSheetUrl: OTHER_URL,
        updatedAt: 2,
      })
    );
  });

  it('rejects when the diff also touches a non-sheet field (name)', async () => {
    await assertFails(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        sharedSheetUrl: SHEET_URL,
        name: 'Renamed via the sheet branch',
        updatedAt: 2,
      })
    );
  });

  it('rejects a non-member setting the sheet URL', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        sharedSheetUrl: SHEET_URL,
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isUpdatingPlcFeatures — any member toggles the dashboard features map
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — isUpdatingPlcFeatures', () => {
  it('a member can toggle the features map (diff limited to features/updatedAt)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        features: { sharedBoards: true, todos: false },
        updatedAt: 2,
      })
    );
  });

  it('rejects a non-map features value', async () => {
    await assertFails(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        features: 'not-a-map',
        updatedAt: 2,
      })
    );
  });

  it('rejects when the features update smuggles a memberUids change', async () => {
    await assertFails(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        features: { sharedBoards: true },
        memberUids: [MEMBER_A_UID, MEMBER_B_UID, NON_MEMBER_UID],
        updatedAt: 2,
      })
    );
  });

  it('rejects when the features update smuggles a leadUid change', async () => {
    await assertFails(
      updateDoc(doc(asMemberB(), `plcs/${PLC_ID}`), {
        features: { sharedBoards: true },
        leadUid: MEMBER_B_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a non-member toggling features', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        features: { sharedBoards: true },
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Lead broad-update branch — rename / add members, but cannot vacate
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — lead broad-update guard', () => {
  it('the lead can rename the PLC', async () => {
    await assertSucceeds(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}`), {
        name: 'Renamed by the lead',
        updatedAt: 2,
      })
    );
  });

  it('the lead can add a member', async () => {
    await assertSucceeds(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_A_UID, MEMBER_B_UID, NON_MEMBER_UID],
        memberEmails: {
          [MEMBER_A_UID]: MEMBER_A_EMAIL,
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects the lead changing leadUid (no leadership seizure via broad update)', async () => {
    // leadUid is immutable on the broad lead-update branch — the guard
    // requires request.resource.data.leadUid == resource.data.leadUid.
    await assertFails(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_B_UID,
        updatedAt: 2,
      })
    );
  });

  it("rejects the lead dropping themselves from memberUids (lead-can't-vacate)", async () => {
    // The lead must stay in memberUids on the broad-update branch; this
    // blocks the lead from vacating without the isLeavingPlc transfer flow.
    await assertFails(
      updateDoc(doc(asMemberA(), `plcs/${PLC_ID}`), {
        memberUids: [MEMBER_B_UID],
        memberEmails: {
          [MEMBER_B_UID]: MEMBER_B_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a non-member exercising the broad-update branch', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        name: 'Outsider rename',
        updatedAt: 2,
      })
    );
  });
});
