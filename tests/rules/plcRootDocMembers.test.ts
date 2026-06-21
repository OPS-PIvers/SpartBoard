// Firestore rules regression coverage for the PLC root doc (`plcs/{plcId}`)
// under the canonical `members` map model (Decisions 1.1 / 1.2 / 1.3, T6).
//
// This suite is the dedicated T7 coverage for EVERY new/changed root-doc
// branch introduced by T6. It mirrors the structure of plcRootDoc.test.ts /
// plcMembership.test.ts but is organized by the security invariant under test,
// covering each branch end-to-end:
//
//   (1) READ gate — a member keyed in the canonical `members` map OR in the
//       denormalized `memberUids` index may read; a non-member (in neither) is
//       denied.
//   (2) CREATE — a lead-only sole-member `members` map at role 'lead' succeeds;
//       a create carrying a SECOND lead, or with mismatched memberUids/leadUid,
//       is denied; optional tenancy fields (`orgId`/`buildingId`) succeed as
//       both null and string; createdAt accepts a Firestore Timestamp AND a
//       legacy int (dual-accept, §3.2).
//   (3) transferLead (isTransferringPlcLead) — lead/coLead may move the crown
//       (outgoing lead → member, incoming → lead, leadUid mirror moves in
//       lockstep); plain member/viewer cannot; a transfer that leaves zero or
//       two leads is denied (the exactly-one-lead invariant).
//   (4) changeRole (isChangingMemberRole) — lead/coLead may set a member to
//       coLead/member/viewer; promoting a SECOND lead is denied; plain
//       member/viewer cannot change roles.
//   (5) accept-invite + leave — both still pass AND now maintain the members
//       map (append self / flip self to 'removed') in lockstep with the
//       denormalized indexes.
//   (6) updatedAt dual-accept — accepted as both a Firestore Timestamp and a
//       legacy int on the mutating branches.
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
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-root-doc-members';
const PLC_ID = 'plc-root-doc-members-test';

const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@example.com';
const COLEAD_UID = 'colead-uid';
const COLEAD_EMAIL = 'colead@example.com';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@example.com';
const VIEWER_UID = 'viewer-uid';
const VIEWER_EMAIL = 'viewer@example.com';
const NON_MEMBER_UID = 'non-member-uid';
const NON_MEMBER_EMAIL = 'newcomer@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asLead = () =>
  testEnv.authenticatedContext(LEAD_UID, { email: LEAD_EMAIL }).firestore();
const asCoLead = () =>
  testEnv.authenticatedContext(COLEAD_UID, { email: COLEAD_EMAIL }).firestore();
const asMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();
const asViewer = () =>
  testEnv.authenticatedContext(VIEWER_UID, { email: VIEWER_EMAIL }).firestore();
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

// A canonical PlcMember entry. joinedAt defaults to a legacy int (1); callers
// override it (e.g. serverTimestamp()) where the dual-accept path is tested.
const member = (
  uid: string,
  email: string,
  role: 'lead' | 'coLead' | 'member' | 'viewer',
  status: 'active' | 'removed' = 'active',
  joinedAt: unknown = 1
) => ({
  uid,
  email,
  displayName: email.split('@')[0],
  role,
  joinedAt,
  status,
});

// The base root doc carries the canonical `members` map AND the denormalized
// memberUids/memberEmails/leadUid indexes in lockstep — exactly the shape a
// T2/T6 mutator writes. LEAD leads; COLEAD is a co-lead manager; MEMBER is a
// plain member; VIEWER is a viewer.
const baseRoot = () => ({
  name: 'Test PLC',
  leadUid: LEAD_UID,
  memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
  memberEmails: {
    [LEAD_UID]: LEAD_EMAIL,
    [COLEAD_UID]: COLEAD_EMAIL,
    [MEMBER_UID]: MEMBER_EMAIL,
    [VIEWER_UID]: VIEWER_EMAIL,
  },
  members: {
    [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
    [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
    [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
    [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
  },
  createdAt: 1,
  updatedAt: 1,
});

const seedBase = async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), baseRoot());
  });
};

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBase();
});

// Seed a pending invitation doc keyed `<plcId>_<emailLower>` so the
// isAcceptingPlcInvite get() lookup resolves.
const seedPendingInvite = async (emailLower: string, status = 'pending') => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `plc_invitations/${PLC_ID}_${emailLower}`),
      {
        plcId: PLC_ID,
        email: emailLower,
        invitedBy: LEAD_UID,
        status,
        createdAt: 1,
      }
    );
  });
};

// ===========================================================================
// (1) READ gate — members-map key OR denormalized memberUids; non-member denied
// ===========================================================================

describe('plcs/{plcId} read — members-map gate', () => {
  it('a member keyed only in the members map (no memberUids) can read', async () => {
    // Map-only PLC: authorize purely via the canonical `members` map key.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        name: 'Map-only PLC',
        leadUid: LEAD_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
        },
        // Intentionally EMPTY memberUids — only the map authorizes members.
        memberUids: [],
        memberEmails: {},
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await assertSucceeds(getDoc(doc(asMember(), `plcs/${PLC_ID}`)));
  });

  it('a member keyed only in memberUids (no members map) can read', async () => {
    // Legacy array-only PLC: authorize via the denormalized index.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        name: 'Array-only PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID, MEMBER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
        },
        // No `members` map at all (un-migrated).
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await assertSucceeds(getDoc(doc(asMember(), `plcs/${PLC_ID}`)));
  });

  it('a member present in both shapes can read', async () => {
    await assertSucceeds(getDoc(doc(asCoLead(), `plcs/${PLC_ID}`)));
  });

  it('a non-member (in neither map nor memberUids) is denied', async () => {
    // Base seed has no orgId, so the org-directory branch is inert and the
    // non-member has no membership-map key and no memberUids entry.
    await assertFails(getDoc(doc(asNonMember(), `plcs/${PLC_ID}`)));
  });
});

// ===========================================================================
// (2) CREATE — lead-only sole-member map; tenancy + timestamp dual-accept
// ===========================================================================

describe('plcs/{plcId} create — lead-only sole-member members map', () => {
  const newDoc = (id: string) => doc(asLead(), `plcs/${id}`);

  it('creates with the sole creator at role lead + mirrored indexes', async () => {
    await assertSucceeds(
      setDoc(newDoc('plc-create-ok'), {
        name: 'New PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
        },
        orgId: null,
        buildingId: null,
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('rejects a create whose members map carries a SECOND lead', async () => {
    // Two-key members map (and thus two leads) violates the sole-member create
    // invariant: members.keys() must be exactly [creator].
    await assertFails(
      setDoc(newDoc('plc-create-second-lead'), {
        name: 'Two-lead PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID, COLEAD_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'lead'),
        },
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('rejects a create whose memberUids does not match [creator]', async () => {
    // memberUids carries an extra uid that is not the sole creator.
    await assertFails(
      setDoc(newDoc('plc-create-bad-uids'), {
        name: 'Mismatched memberUids PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID, MEMBER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
        },
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('rejects a create whose leadUid is not the creator', async () => {
    // leadUid points at another uid — the creator must be the lead.
    await assertFails(
      setDoc(newDoc('plc-create-bad-lead'), {
        name: 'Wrong-lead PLC',
        leadUid: MEMBER_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
        },
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('rejects a create whose sole member is not role lead', async () => {
    await assertFails(
      setDoc(newDoc('plc-create-member-role'), {
        name: 'Non-lead sole member PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
        },
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('creates with optional orgId/buildingId omitted', async () => {
    await assertSucceeds(
      setDoc(newDoc('plc-create-no-tenancy'), {
        name: 'No-tenancy PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
        },
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('creates with orgId/buildingId as null', async () => {
    await assertSucceeds(
      setDoc(newDoc('plc-create-null-tenancy'), {
        name: 'Null-tenancy PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
        },
        orgId: null,
        buildingId: null,
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('creates with orgId/buildingId as strings', async () => {
    await assertSucceeds(
      setDoc(newDoc('plc-create-string-tenancy'), {
        name: 'String-tenancy PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
        },
        orgId: 'org-1',
        buildingId: 'bldg-1',
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('creates with createdAt/updatedAt as legacy ints (dual-accept)', async () => {
    await assertSucceeds(
      setDoc(newDoc('plc-create-int-ts'), {
        name: 'Int-TS PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead', 'active', 1),
        },
        createdAt: 1735689600000,
        updatedAt: 1735689600000,
      })
    );
  });

  it('creates with createdAt/updatedAt as Firestore Timestamps (dual-accept)', async () => {
    await assertSucceeds(
      setDoc(newDoc('plc-create-ts'), {
        name: 'Server-TS PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        members: {
          [LEAD_UID]: member(
            LEAD_UID,
            LEAD_EMAIL,
            'lead',
            'active',
            serverTimestamp()
          ),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });
});

// ===========================================================================
// (3) transferLead (isTransferringPlcLead) — lead/coLead move the crown
// ===========================================================================

describe('plcs/{plcId} update — transferLead', () => {
  it('the lead can transfer leadership to an existing member', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('a co-lead can transfer leadership to an existing member', async () => {
    await assertSucceeds(
      updateDoc(doc(asCoLead(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a plain member transferring leadership', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a viewer transferring leadership', async () => {
    await assertFails(
      updateDoc(doc(asViewer(), `plcs/${PLC_ID}`), {
        leadUid: VIEWER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'lead'),
        },
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a transfer that leaves TWO leads (old lead not demoted)', async () => {
    // leadUid moves to MEMBER but the outgoing LEAD keeps role 'lead' — the map
    // lockstep check requires the outgoing lead to be demoted.
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a transfer that leaves ZERO leads (new lead not promoted)', async () => {
    // leadUid moves to MEMBER but MEMBER's map role stays 'member' — the map
    // lockstep check requires the incoming leadUid member to be role 'lead'.
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects transferring leadership to a non-member', async () => {
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        leadUid: NON_MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
          [NON_MEMBER_UID]: member(NON_MEMBER_UID, NON_MEMBER_EMAIL, 'lead'),
        },
        memberUids: [
          LEAD_UID,
          COLEAD_UID,
          MEMBER_UID,
          VIEWER_UID,
          NON_MEMBER_UID,
        ],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('the lead can transfer with a serverTimestamp updatedAt (dual-accept)', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        updatedAt: serverTimestamp(),
      })
    );
  });
});

// ===========================================================================
// (4) changeRole (isChangingMemberRole) — lead/coLead set non-lead roles
// ===========================================================================

describe('plcs/{plcId} update — changeRole', () => {
  it('the lead can promote a member to coLead (roleChangeUid pointer)', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        roleChangeUid: MEMBER_UID,
        updatedAt: 2,
      })
    );
  });

  it('a co-lead can set a member to member', async () => {
    // VIEWER (viewer → member), driven by the co-lead manager.
    await assertSucceeds(
      updateDoc(doc(asCoLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'member'),
        },
        roleChangeUid: VIEWER_UID,
        updatedAt: 2,
      })
    );
  });

  it('a co-lead can set a member to viewer', async () => {
    await assertSucceeds(
      updateDoc(doc(asCoLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'viewer'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        roleChangeUid: MEMBER_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects promoting a member to a SECOND lead via the role-change branch', async () => {
    // The role-change branch forbids minting 'lead' — only transferLead moves
    // the crown. Promoting MEMBER to 'lead' (named by roleChangeUid) must be
    // denied: 'lead' is not in the role-change branch's allowed {coLead, member,
    // viewer} set. The actor is the lead, so this ALSO probes the broad branch —
    // which now rejects it too (plcBroadMembersOk permits only a lone removal,
    // not a role promotion), so the write fails closed on every branch.
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        roleChangeUid: MEMBER_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects the LEAD minting a second lead via the broad branch (no role pointer)', async () => {
    // Regression for the broad sitting-lead update branch. Without a
    // roleChangeUid the write can't be excused as the role-change branch, so it
    // can only match the broad lead branch — which previously imposed NO
    // members-map constraint and would have ALLOWED a two-lead map. With
    // plcBroadMembersOk() in place the broad branch limits members mutations to
    // a single named removal, so promoting COLEAD to a second 'lead' fails
    // closed. (See migratePlcs.ts: "Multiple active leads" is corruption.)
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        updatedAt: 2,
      })
    );
  });

  it('the lead can still remove a member via the broad branch (removeMemberUid)', async () => {
    // The exactly-one-lead guard must NOT break the legitimate broad-branch
    // members write: a lone removal named by removeMemberUid still succeeds.
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer', 'removed'),
        },
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
        },
        removeMemberUid: VIEWER_UID,
        updatedAt: 2,
      })
    );
  });

  it('the lead can still rename the PLC via the broad branch (members untouched)', async () => {
    // plcBroadMembersOk() short-circuits to true when members is untouched, so
    // a plain rename still passes.
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        name: 'Renamed Team',
        updatedAt: 2,
      })
    );
  });

  it('rejects demoting the sitting lead via the role-change branch', async () => {
    await assertFails(
      updateDoc(doc(asCoLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        roleChangeUid: LEAD_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a plain member changing roles', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'member'),
        },
        roleChangeUid: VIEWER_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a viewer changing roles', async () => {
    await assertFails(
      updateDoc(doc(asViewer(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'viewer'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        roleChangeUid: MEMBER_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a role change that smuggles a non-allowed field (name)', async () => {
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        roleChangeUid: MEMBER_UID,
        name: 'smuggled rename',
        updatedAt: 2,
      })
    );
  });

  it('a co-lead can change a role with a serverTimestamp updatedAt (dual-accept)', async () => {
    await assertSucceeds(
      updateDoc(doc(asCoLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'viewer'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        roleChangeUid: MEMBER_UID,
        updatedAt: serverTimestamp(),
      })
    );
  });
});

// ===========================================================================
// (5) accept-invite + leave — both pass AND maintain the members map
// ===========================================================================

describe('plcs/{plcId} update — accept-invite (members-map maintenance)', () => {
  it('a non-member with a pending invite self-appends to BOTH the map and indexes', async () => {
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertSucceeds(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [
          LEAD_UID,
          COLEAD_UID,
          MEMBER_UID,
          VIEWER_UID,
          NON_MEMBER_UID,
        ],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
          [NON_MEMBER_UID]: member(NON_MEMBER_UID, NON_MEMBER_EMAIL, 'member'),
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects an accept whose members entry mints the caller as lead', async () => {
    // The accept branch only permits appending the caller as role 'member'
    // (active). Self-appending as 'lead' must be denied.
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [
          LEAD_UID,
          COLEAD_UID,
          MEMBER_UID,
          VIEWER_UID,
          NON_MEMBER_UID,
        ],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
          [NON_MEMBER_UID]: member(NON_MEMBER_UID, NON_MEMBER_EMAIL, 'lead'),
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects an accept whose members diff also rewrites a teammate entry', async () => {
    // Only the caller's own members-map key may be added; rewriting MEMBER's
    // role while self-appending must be denied.
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [
          LEAD_UID,
          COLEAD_UID,
          MEMBER_UID,
          VIEWER_UID,
          NON_MEMBER_UID,
        ],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
          [NON_MEMBER_UID]: member(NON_MEMBER_UID, NON_MEMBER_EMAIL, 'member'),
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects an accept with no pending invite', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [
          LEAD_UID,
          COLEAD_UID,
          MEMBER_UID,
          VIEWER_UID,
          NON_MEMBER_UID,
        ],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
          [NON_MEMBER_UID]: member(NON_MEMBER_UID, NON_MEMBER_EMAIL, 'member'),
        },
        updatedAt: 2,
      })
    );
  });

  it('accepts with a serverTimestamp updatedAt (dual-accept)', async () => {
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertSucceeds(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        memberUids: [
          LEAD_UID,
          COLEAD_UID,
          MEMBER_UID,
          VIEWER_UID,
          NON_MEMBER_UID,
        ],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
          [NON_MEMBER_UID]: member(
            NON_MEMBER_UID,
            NON_MEMBER_EMAIL,
            'member',
            'active',
            serverTimestamp()
          ),
        },
        updatedAt: serverTimestamp(),
      })
    );
  });
});

describe('plcs/{plcId} update — leave (members-map maintenance)', () => {
  it('a non-lead member self-removes, flipping their own map entry to removed', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        memberUids: [LEAD_UID, COLEAD_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member', 'removed'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a leave whose members diff rewrites a teammate instead of self-removing', async () => {
    // MEMBER leaves but the members diff rewrites LEAD's entry and never marks
    // MEMBER 'removed' — membersUntouchedOrSelfRemoved rejects it.
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        memberUids: [LEAD_UID, COLEAD_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'coLead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects the lead leaving (no vacate without transfer)', async () => {
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        memberUids: [COLEAD_UID, MEMBER_UID, VIEWER_UID],
        memberEmails: {
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead', 'removed'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects the leave path being used to seize leadership', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        memberUids: [LEAD_UID, COLEAD_UID, VIEWER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [VIEWER_UID]: VIEWER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member', 'removed'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
        },
        updatedAt: 2,
      })
    );
  });

  it('leaves with a serverTimestamp updatedAt (dual-accept)', async () => {
    await assertSucceeds(
      updateDoc(doc(asViewer(), `plcs/${PLC_ID}`), {
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [VIEWER_UID]: member(VIEWER_UID, VIEWER_EMAIL, 'viewer', 'removed'),
        },
        updatedAt: serverTimestamp(),
      })
    );
  });
});

// ===========================================================================
// (6) updatedAt dual-accept — int AND timestamp on the broad lead branch
// ===========================================================================

describe('plcs/{plcId} update — updatedAt dual-accept (broad lead branch)', () => {
  it('the lead can bump updatedAt with a legacy int', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        name: 'Renamed with int ts',
        updatedAt: 1735689600000,
      })
    );
  });

  it('the lead can bump updatedAt with a Firestore Timestamp', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        name: 'Renamed with server ts',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('rejects a non-numeric, non-timestamp updatedAt', async () => {
    // plcUpdatedAtOk() requires updatedAt to be a timestamp OR int; a string
    // fails every mutating branch.
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        name: 'Renamed with bad ts',
        updatedAt: 'not-a-timestamp',
      })
    );
  });
});
