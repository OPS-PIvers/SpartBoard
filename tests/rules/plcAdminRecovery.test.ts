// Firestore security rules regression coverage for ADMIN RECOVERY on the PLC
// root doc (`plcs/{plcId}`) — Decision 3.4 / §3.4, Wave 4 task W4-T1. A site
// admin (`isAdmin()` — a doc under /admins) who belongs to the SAME org as the
// PLC may recover an abandoned PLC by (a) reassigning leadership (leadUid +
// members-map lead role move in lockstep, identical to isTransferringPlcLead)
// WITHOUT being a member, and (b) dissolving (deleting) the PLC.
//
// This suite pins:
//   (1) reassign lead — an in-org admin CAN move the crown (lockstep); the
//       membership set is unchanged; the diff is closed to the lead-reassign
//       field-set.
//   (2) dissolve — an in-org admin CAN delete the PLC; the sitting lead still
//       can delete; a member CANNOT delete; an out-of-org admin CANNOT delete.
//   (3) scoping — a same-org NON-admin canNOT reassign; an admin in a DIFFERENT
//       org canNOT reassign; an admin canNOT reassign an org-LESS PLC.
//   (4) invariant preservation — an admin reassign that leaves TWO leads (old
//       lead not demoted) or ZERO leads (new lead not promoted) is denied; an
//       admin canNOT smuggle a name/orgId change or add/drop a member through
//       this branch.
//   (5) no branch-overlap regression — the existing member branches still pass
//       under the new admin branch: a sitting lead transfers, a member leaves,
//       an invitee accepts, a lead/co-lead changes a role. The admin branch
//       requires isAdmin()+same-org, which no member branch grants, so the
//       branches stay mutually exclusive.
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
import { setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-admin-recovery';

const ORG_ID = 'org-orono';
const OTHER_ORG_ID = 'org-elsewhere';

const ORG_PLC_ID = 'plc-org-stamped';
const LEGACY_PLC_ID = 'plc-no-org';

const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@orono.k12.mn.us';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@orono.k12.mn.us';
const COLEAD_UID = 'colead-uid';
const COLEAD_EMAIL = 'colead@orono.k12.mn.us';

// In-org site admin: an admin doc + a member of ORG_ID, but NOT a PLC member.
const ADMIN_UID = 'admin-uid';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';
// Same-org NON-admin (member of the org, no /admins doc, not a PLC member).
const ORG_PEER_UID = 'org-peer-uid';
const ORG_PEER_EMAIL = 'peer@orono.k12.mn.us';
// Out-of-org admin: an admin doc, but a member of a DIFFERENT org.
const OTHER_ADMIN_UID = 'other-admin-uid';
const OTHER_ADMIN_EMAIL = 'admin@elsewhere.org';
// Invitee (for the accept-invite no-regression check).
const INVITEE_UID = 'invitee-uid';
const INVITEE_EMAIL = 'invitee@orono.k12.mn.us';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asLead = () =>
  testEnv.authenticatedContext(LEAD_UID, { email: LEAD_EMAIL }).firestore();
const asMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();
const asCoLead = () =>
  testEnv.authenticatedContext(COLEAD_UID, { email: COLEAD_EMAIL }).firestore();
const asAdmin = () =>
  testEnv.authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL }).firestore();
const asOrgPeer = () =>
  testEnv
    .authenticatedContext(ORG_PEER_UID, { email: ORG_PEER_EMAIL })
    .firestore();
const asOtherAdmin = () =>
  testEnv
    .authenticatedContext(OTHER_ADMIN_UID, { email: OTHER_ADMIN_EMAIL })
    .firestore();
const asInvitee = () =>
  testEnv
    .authenticatedContext(INVITEE_UID, { email: INVITEE_EMAIL })
    .firestore();

const member = (
  uid: string,
  email: string,
  role: 'lead' | 'coLead' | 'member' | 'viewer'
) => ({
  uid,
  email,
  displayName: email.split('@')[0],
  role,
  joinedAt: 1,
  status: 'active',
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

// Org-stamped PLC: LEAD leads, MEMBER + COLEAD are members. The admin / org
// peer are NOT PLC members (recovery is a non-member admin action).
const orgRoot = () => ({
  name: 'Org-Stamped PLC',
  orgId: ORG_ID,
  buildingId: 'bldg-oms',
  leadUid: LEAD_UID,
  memberUids: [LEAD_UID, MEMBER_UID, COLEAD_UID],
  memberEmails: {
    [LEAD_UID]: LEAD_EMAIL,
    [MEMBER_UID]: MEMBER_EMAIL,
    [COLEAD_UID]: COLEAD_EMAIL,
  },
  members: {
    [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
    [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
    [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
  },
  createdAt: 1,
  updatedAt: 1,
});

const legacyRoot = () => ({
  name: 'Org-less PLC',
  leadUid: LEAD_UID,
  memberUids: [LEAD_UID, MEMBER_UID],
  memberEmails: {
    [LEAD_UID]: LEAD_EMAIL,
    [MEMBER_UID]: MEMBER_EMAIL,
  },
  members: {
    [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
    [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
  },
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // /admins membership (isAdmin() checks /admins/{email.lower()}).
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(db, `admins/${OTHER_ADMIN_EMAIL}`), {});
    // Org membership (isOrgMember() checks /organizations/{org}/members/{email}).
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${ADMIN_EMAIL}`), {
      roleId: 'admin',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${ORG_PEER_EMAIL}`), {
      roleId: 'staff',
    });
    await setDoc(
      doc(db, `organizations/${OTHER_ORG_ID}/members/${OTHER_ADMIN_EMAIL}`),
      { roleId: 'admin' }
    );
    await setDoc(doc(db, `plcs/${ORG_PLC_ID}`), orgRoot());
    await setDoc(doc(db, `plcs/${LEGACY_PLC_ID}`), legacyRoot());
  });
});

// A reassign-lead payload moving the crown LEAD → MEMBER in lockstep with the
// members map. `overrides` lets individual tests corrupt one facet.
const reassignToMember = (overrides: Record<string, unknown> = {}) => ({
  leadUid: MEMBER_UID,
  members: {
    [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
    [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
    [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
  },
  memberUids: [LEAD_UID, MEMBER_UID, COLEAD_UID],
  memberEmails: {
    [LEAD_UID]: LEAD_EMAIL,
    [MEMBER_UID]: MEMBER_EMAIL,
    [COLEAD_UID]: COLEAD_EMAIL,
  },
  updatedAt: 2,
  ...overrides,
});

// ===========================================================================
// (1) Reassign lead — in-org admin CAN move the crown
// ===========================================================================

describe('plcs/{plcId} — admin reassigns lead (Decision 3.4)', () => {
  it('an in-org site admin CAN reassign leadership (leadUid + members lockstep)', async () => {
    await assertSucceeds(
      updateDoc(doc(asAdmin(), `plcs/${ORG_PLC_ID}`), reassignToMember())
    );
  });

  it('the reassign keeps the membership SET unchanged', async () => {
    // Dropping COLEAD while reassigning is rejected — recovery reassigns a role,
    // it never adds/drops members.
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${ORG_PLC_ID}`),
        reassignToMember({
          members: {
            [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
            [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          },
          memberUids: [LEAD_UID, MEMBER_UID],
          memberEmails: { [LEAD_UID]: LEAD_EMAIL, [MEMBER_UID]: MEMBER_EMAIL },
        })
      )
    );
  });

  it('the admin canNOT smuggle a name change through the reassign branch', async () => {
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${ORG_PLC_ID}`),
        reassignToMember({ name: 'Renamed by admin' })
      )
    );
  });

  it('the admin canNOT smuggle an orgId change (re-home) through this branch', async () => {
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${ORG_PLC_ID}`),
        reassignToMember({ orgId: OTHER_ORG_ID })
      )
    );
  });

  it('rejects an admin reassign that leaves TWO leads (old lead not demoted)', async () => {
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${ORG_PLC_ID}`),
        reassignToMember({
          members: {
            [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
            [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
            [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          },
        })
      )
    );
  });

  it('rejects an admin reassign that leaves ZERO leads (new lead not promoted)', async () => {
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${ORG_PLC_ID}`),
        reassignToMember({
          members: {
            [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
            [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
            [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          },
        })
      )
    );
  });
});

// ===========================================================================
// (3) Scoping — only an in-org admin; not a peer, not an out-of-org admin
// ===========================================================================

describe('plcs/{plcId} — admin reassign scoping', () => {
  it('a same-org NON-admin (org peer) canNOT reassign leadership', async () => {
    await assertFails(
      updateDoc(doc(asOrgPeer(), `plcs/${ORG_PLC_ID}`), reassignToMember())
    );
  });

  it('an admin in a DIFFERENT org canNOT reassign leadership', async () => {
    await assertFails(
      updateDoc(doc(asOtherAdmin(), `plcs/${ORG_PLC_ID}`), reassignToMember())
    );
  });

  it('an in-org admin canNOT reassign an org-LESS PLC (no orgId to scope on)', async () => {
    // Legacy PLC has no orgId, so isAdminManagingPlc()'s orgId-is-string gate
    // fails and the admin is treated like any non-member: denied.
    await assertFails(
      updateDoc(doc(asAdmin(), `plcs/${LEGACY_PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
        },
        memberUids: [LEAD_UID, MEMBER_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL, [MEMBER_UID]: MEMBER_EMAIL },
        updatedAt: 2,
      })
    );
  });
});

// ===========================================================================
// (2) Dissolve — in-org admin CAN delete; lead can delete; others cannot
// ===========================================================================

describe('plcs/{plcId} — dissolve (delete)', () => {
  it('an in-org site admin CAN dissolve (delete) the PLC', async () => {
    await assertSucceeds(deleteDoc(doc(asAdmin(), `plcs/${ORG_PLC_ID}`)));
  });

  it('the sitting lead CAN still dissolve the PLC (existing path preserved)', async () => {
    await assertSucceeds(deleteDoc(doc(asLead(), `plcs/${ORG_PLC_ID}`)));
  });

  it('a plain member canNOT dissolve the PLC', async () => {
    await assertFails(deleteDoc(doc(asMember(), `plcs/${ORG_PLC_ID}`)));
  });

  it('a same-org NON-admin (org peer) canNOT dissolve the PLC', async () => {
    await assertFails(deleteDoc(doc(asOrgPeer(), `plcs/${ORG_PLC_ID}`)));
  });

  it('an admin in a DIFFERENT org canNOT dissolve the PLC', async () => {
    await assertFails(deleteDoc(doc(asOtherAdmin(), `plcs/${ORG_PLC_ID}`)));
  });

  it('an in-org admin canNOT dissolve an org-LESS PLC (no orgId to scope on)', async () => {
    await assertFails(deleteDoc(doc(asAdmin(), `plcs/${LEGACY_PLC_ID}`)));
  });
});

// ===========================================================================
// (5) No branch-overlap regression — member branches still pass alongside the
//     new admin branch; they remain mutually exclusive.
// ===========================================================================

describe('plcs/{plcId} — member branches unaffected by the admin branch', () => {
  it('a sitting lead can STILL transfer leadership (isTransferringPlcLead)', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${ORG_PLC_ID}`), reassignToMember())
    );
  });

  it('a co-lead can STILL change a member’s role (isChangingMemberRole)', async () => {
    await assertSucceeds(
      updateDoc(doc(asCoLead(), `plcs/${ORG_PLC_ID}`), {
        roleChangeUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'viewer'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
        },
        updatedAt: 2,
      })
    );
  });

  it('a non-lead member can STILL leave (isLeavingPlc)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${ORG_PLC_ID}`), {
        memberUids: [LEAD_UID, COLEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL, [COLEAD_UID]: COLEAD_EMAIL },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          // The leaver's own entry flips to status 'removed' in lockstep.
          [MEMBER_UID]: {
            ...member(MEMBER_UID, MEMBER_EMAIL, 'member'),
            status: 'removed',
          },
        },
        updatedAt: 2,
      })
    );
  });

  it('an invitee can STILL accept an invite (isAcceptingPlcInvite)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plc_invitations/${ORG_PLC_ID}_${INVITEE_EMAIL}`),
        {
          plcId: ORG_PLC_ID,
          email: INVITEE_EMAIL,
          invitedBy: LEAD_UID,
          status: 'pending',
          createdAt: 1,
        }
      );
    });
    await assertSucceeds(
      updateDoc(doc(asInvitee(), `plcs/${ORG_PLC_ID}`), {
        memberUids: [LEAD_UID, MEMBER_UID, COLEAD_UID, INVITEE_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [INVITEE_UID]: INVITEE_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [INVITEE_UID]: member(INVITEE_UID, INVITEE_EMAIL, 'member'),
        },
        updatedAt: 2,
      })
    );
  });

  it('an org peer (non-admin) still canNOT write the root via any branch', async () => {
    await assertFails(
      updateDoc(doc(asOrgPeer(), `plcs/${ORG_PLC_ID}`), {
        name: 'Hijacked',
        updatedAt: 2,
      })
    );
  });
});
