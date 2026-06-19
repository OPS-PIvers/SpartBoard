// Firestore rules regression coverage for the PLC *membership mutators*
// added in Wave 1 / T2 (`hooks/usePlcs.ts`): role changes, leadership
// transfer, member removal, and the members-map-aware leave path. These pin
// the canonical `members` map (Decision 1.2) invariants on the root doc:
//
//   - isTransferringPlcLead: only the sitting lead may move `leadUid`, and
//     only to an existing member; the membership SET is unchanged; the diff
//     is limited to leadUid + members + the denormalized indexes + updatedAt.
//     A non-lead transferring, or transferring to a non-member, is rejected.
//   - Lead broad-update branch also carries `setMemberRole` (role flip in the
//     members map, leadUid unchanged) and `removeMember` (drop a member from
//     memberUids + flip their status to 'removed'). The lead must stay in
//     memberUids; leadUid stays immutable on that branch.
//   - isLeavingPlc now tolerates the `members` map in the diff (a leaver
//     flips their own status to 'removed') but still pins the field-set and
//     keeps leadUid immutable, so it can't be used to seize leadership.
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

const PROJECT_ID = 'spartboard-plc-membership';
const PLC_ID = 'plc-membership-test';

const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@example.com';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@example.com';
const OTHER_UID = 'other-uid';
const OTHER_EMAIL = 'other@example.com';
const NON_MEMBER_UID = 'non-member-uid';
const NON_MEMBER_EMAIL = 'newcomer@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asLead = () =>
  testEnv.authenticatedContext(LEAD_UID, { email: LEAD_EMAIL }).firestore();
const asMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();
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

// Base root doc carries the canonical members map AND the denormalized
// indexes in lockstep (the shape every T2 mutator writes). Lead + member +
// other are all active members; the lead leads.
const member = (
  uid: string,
  email: string,
  role: 'lead' | 'coLead' | 'member' | 'viewer',
  status: 'active' | 'removed' = 'active'
) => ({
  uid,
  email,
  displayName: email.split('@')[0],
  role,
  joinedAt: 1,
  status,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
      memberEmails: {
        [LEAD_UID]: LEAD_EMAIL,
        [MEMBER_UID]: MEMBER_EMAIL,
        [OTHER_UID]: OTHER_EMAIL,
      },
      members: {
        [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
        [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
        [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// isTransferringPlcLead — the sitting lead hands leadership to a member
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — transferLead', () => {
  it('the lead can transfer leadership to an existing member', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a non-lead member trying to transfer leadership', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
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
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
          [NON_MEMBER_UID]: member(NON_MEMBER_UID, NON_MEMBER_EMAIL, 'lead'),
        },
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID, NON_MEMBER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
          [NON_MEMBER_UID]: NON_MEMBER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a transfer that also renames the PLC (field-set is closed)', async () => {
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        name: 'Renamed during transfer',
        updatedAt: 2,
      })
    );
  });

  it('rejects a transfer that drops a member from the set', async () => {
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'lead'),
        },
        memberUids: [LEAD_UID, MEMBER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// setMemberRole / removeMember — ride the lead broad-update branch
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — setMemberRole', () => {
  it('the lead can promote a member to coLead (leadUid unchanged)', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        updatedAt: 2,
      })
    );
  });

  it('the lead can set a member to viewer', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'viewer'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a plain member changing roles (not the lead)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        updatedAt: 2,
      })
    );
  });
});

describe('plcs/{plcId} update — removeMember', () => {
  it('the lead can remove a member (drops them from memberUids + flips status)', async () => {
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member', 'removed'),
        },
        memberUids: [LEAD_UID, MEMBER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
        },
        // The broad branch now requires a removal pointer naming the single
        // member whose entry changes (plcBroadMembersOk — exactly-one-lead).
        removeMemberUid: OTHER_UID,
        updatedAt: 2,
      })
    );
  });

  it("rejects the lead dropping themselves from memberUids (lead-can't-vacate)", async () => {
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead', 'removed'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        memberUids: [MEMBER_UID, OTHER_UID],
        memberEmails: {
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        removeMemberUid: LEAD_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects the lead minting a SECOND lead via the broad branch (no role pointer)', async () => {
    // The broad sitting-lead branch cannot promote a teammate to 'lead' —
    // plcBroadMembersOk() only permits a lone named removal, so role
    // promotions must go through transferLead. This drives a plain broad
    // update (no roleChangeUid, no removeMemberUid) that sets OTHER to 'lead'.
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'lead'),
        },
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects the lead minting a SECOND lead even with a removeMemberUid pointer', async () => {
    // A removal pointer cannot excuse a role promotion: plcBroadMembersOk
    // requires the named member to flip to status 'removed' and be the ONLY
    // changed entry. Setting OTHER to 'lead' (status active) while naming OTHER
    // as the removal fails the status check; naming MEMBER fails the
    // single-changed-entry check.
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'lead'),
        },
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        removeMemberUid: OTHER_UID,
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isChangingMemberRole — a co-lead changes a member's role via the dedicated
// branch (T6). Co-leads gain membership-management rights; the branch requires
// an explicit `roleChangeUid` pointer, pins the field-set, and refuses to mint
// a second lead or demote the sitting lead.
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — isChangingMemberRole (co-lead)', () => {
  // Re-seed with MEMBER_UID promoted to co-lead so they can manage roles.
  const seedWithCoLead = async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        name: 'Test PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        createdAt: 1,
        updatedAt: 1,
      });
    });
  };

  it('a co-lead can change another member to viewer (with roleChangeUid)', async () => {
    await seedWithCoLead();
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'viewer'),
        },
        roleChangeUid: OTHER_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a co-lead minting a SECOND lead (no second crown)', async () => {
    await seedWithCoLead();
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'lead'),
        },
        roleChangeUid: OTHER_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a co-lead demoting the sitting lead', async () => {
    await seedWithCoLead();
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        roleChangeUid: LEAD_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a role change that smuggles a non-allowed field (name)', async () => {
    await seedWithCoLead();
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'viewer'),
        },
        roleChangeUid: OTHER_UID,
        name: 'smuggled rename',
        updatedAt: 2,
      })
    );
  });

  it('rejects a role change touching two member entries at once', async () => {
    await seedWithCoLead();
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          // Both MEMBER (coLead→member) and OTHER (member→viewer) change.
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'viewer'),
        },
        roleChangeUid: OTHER_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a co-lead role change whose roleChangeUid mismatches the diff', async () => {
    await seedWithCoLead();
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'viewer'),
        },
        // Points at MEMBER_UID but the actually-changed entry is OTHER_UID.
        roleChangeUid: MEMBER_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects a plain member (viewer/member) using the role-change branch', async () => {
    // Base seed: MEMBER_UID is a plain 'member', not a manager.
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'viewer'),
        },
        roleChangeUid: OTHER_UID,
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isTransferringPlcLead (co-lead) — a co-lead may also transfer leadership
// (T6 widened the manager check from lead-only to lead OR coLead).
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — transferLead (co-lead)', () => {
  const seedWithCoLead = async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        name: 'Test PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        createdAt: 1,
        updatedAt: 1,
      });
    });
  };

  it('a co-lead can transfer leadership to another member (lockstep map move)', async () => {
    await seedWithCoLead();
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        leadUid: OTHER_UID,
        members: {
          // Outgoing lead demoted, incoming promoted, the co-lead actor stays.
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'member'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'lead'),
        },
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a transfer that leaves the OUTGOING lead still role lead (two leads)', async () => {
    await seedWithCoLead();
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        leadUid: OTHER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'lead'),
        },
        memberUids: [LEAD_UID, MEMBER_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// isLeavingPlc with members map — a non-lead self-removes
// ---------------------------------------------------------------------------

describe('plcs/{plcId} update — leavePlc (members-map aware)', () => {
  it('a non-lead member can self-remove (flips own status, drops from indexes)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member', 'removed'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        memberUids: [LEAD_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects the leave path being used to seize leadership', async () => {
    // Even though the leaver drops themselves, flipping leadUid via the leave
    // branch must be rejected (leadUid is immutable there).
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        memberUids: [LEAD_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });

  it('rejects a non-member driving the leave path', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [OTHER_UID]: member(OTHER_UID, OTHER_EMAIL, 'member'),
        },
        memberUids: [LEAD_UID, OTHER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [OTHER_UID]: OTHER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });
});
