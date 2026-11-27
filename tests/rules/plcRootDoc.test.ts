// Firestore rules regression coverage for the PLC *root doc* (`plcs/{plcId}`).
// Reads: members and same-org admins read it; a uid keyed only in the members
// map, or a non-member, cannot. Writes: every client create, update and delete
// of the root is refused, because plcSettingsV1 and plcMembershipV1 (Admin SDK)
// do them now: settings, features, cadence, norming labels, layout, calendar,
// shared sheet URL, membership changes, orgId/buildingId backfill, dissolve.
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
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

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
// isAcceptingPlcInvite requires email_verified: true (F-EV1) — a verified
// context for the legitimate accept-invite path.
const asNonMemberVerified = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, {
      email: NON_MEMBER_EMAIL,
      email_verified: true,
    })
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
// PLC create needs district staff: a verified district address with an active member doc.
const staffDb = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
    })
    .firestore();
const seedStaff = (uids: string[]) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all(
      uids.map((uid) =>
        setDoc(
          doc(
            ctx.firestore(),
            `organizations/orono/members/${uid}@orono.k12.mn.us`
          ),
          { orgId: 'orono', roleId: 'teacher', status: 'active' }
        )
      )
    );
  });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedStaff([MEMBER_A_UID]);
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
        inviteeEmailLower: emailLower,
        email: emailLower,
        invitedBy: MEMBER_A_UID,
        status,
        createdAt: 1,
      }
    );
  });
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

describe('plcs/{plcId} — read gate', () => {
  // A members-map-only PLC (empty memberUids): the map entry alone grants no read,
  // because removed members keep theirs; memberUids is the membership gate.
  const seedMapOnly = async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        name: 'Map-only PLC',
        leadUid: MEMBER_A_UID,
        members: {
          [MEMBER_A_UID]: {
            uid: MEMBER_A_UID,
            email: MEMBER_A_EMAIL,
            displayName: 'Member A',
            role: 'lead',
            joinedAt: 1,
            status: 'active',
          },
          [MEMBER_B_UID]: {
            uid: MEMBER_B_UID,
            email: MEMBER_B_EMAIL,
            displayName: 'Member B',
            role: 'member',
            joinedAt: 1,
            status: 'active',
          },
        },
        memberUids: [],
        memberEmails: {},
        createdAt: 1,
        updatedAt: 1,
      });
    });
  };

  it('a uid keyed only in the members map (not in memberUids) cannot read the PLC', async () => {
    await seedMapOnly();
    await assertFails(getDoc(doc(asMemberB(), `plcs/${PLC_ID}`)));
  });

  it('a non-member (not in map or memberUids) cannot read the PLC', async () => {
    await seedMapOnly();
    await assertFails(getDoc(doc(asNonMember(), `plcs/${PLC_ID}`)));
  });

  it('members and viewers read the cadence, norming labels and tenancy; non-members cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        meetingCadence: { frequency: 'weekly', weekday: 4, time: '15:15' },
        normingLevelLabels: {
          high: 'Exceeds',
          medium: 'Meets',
          low: 'Partially meets',
        },
        orgId: 'org-1',
        buildingId: 'bldg-1',
        members: {
          [MEMBER_A_UID]: { uid: MEMBER_A_UID, role: 'lead', status: 'active' },
          [MEMBER_B_UID]: {
            uid: MEMBER_B_UID,
            role: 'viewer',
            status: 'active',
          },
        },
      });
    });
    await assertSucceeds(getDoc(doc(asMemberA(), `plcs/${PLC_ID}`)));
    await assertSucceeds(getDoc(doc(asMemberB(), `plcs/${PLC_ID}`)));
    await assertFails(getDoc(doc(asNonMember(), `plcs/${PLC_ID}`)));
  });
});

// ---------------------------------------------------------------------------
// Create: refused (plcSettingsV1 creates the root)
// ---------------------------------------------------------------------------

describe('plcs/{plcId} — create refused', () => {
  const rootFor = (uid: string, email: string, extra = {}) => ({
    name: 'New PLC',
    leadUid: uid,
    memberUids: [uid],
    memberEmails: { [uid]: email },
    members: {
      [uid]: {
        uid,
        email,
        displayName: 'Creator',
        role: 'lead',
        joinedAt: 1,
        status: 'active',
      },
    },
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  });

  it('a district-staff creator can no longer create a team directly', async () => {
    const db = staffDb(MEMBER_A_UID);
    await assertFails(
      setDoc(
        doc(db, 'plcs/plc-members-create'),
        rootFor(MEMBER_A_UID, MEMBER_A_EMAIL, {
          orgId: 'org-1',
          buildingId: 'bldg-1',
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, 'plcs/plc-timestamps'),
        rootFor(MEMBER_A_UID, MEMBER_A_EMAIL, {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      )
    );
  });

  it('a non-staff user cannot create a team either', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), 'plcs/plc-outsider'),
        rootFor(NON_MEMBER_UID, NON_MEMBER_EMAIL)
      )
    );
  });

  it('nobody re-creates a used PLC id, its creator included', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'plcCreators/plc-recreated'), {
        creatorUid: MEMBER_A_UID,
        rootCreateMs: 1,
      });
    });
    await assertFails(
      setDoc(
        doc(staffDb(MEMBER_A_UID), 'plcs/plc-recreated'),
        rootFor(MEMBER_A_UID, MEMBER_A_EMAIL)
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Update and delete: refused (plcSettingsV1 and plcMembershipV1 do them)
// ---------------------------------------------------------------------------

describe('plcs/{plcId} — update refused', () => {
  const ref = (db: ReturnType<typeof asMemberA>) => doc(db, `plcs/${PLC_ID}`);

  const setRoleB = async (role: string) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        members: {
          [MEMBER_A_UID]: { uid: MEMBER_A_UID, role: 'lead', status: 'active' },
          [MEMBER_B_UID]: { uid: MEMBER_B_UID, role, status: 'active' },
        },
      });
    });
  };

  it('the lead can no longer rename the PLC or bump updatedAt', async () => {
    await assertFails(
      updateDoc(ref(asMemberA()), { name: 'Renamed', updatedAt: 2 })
    );
    await assertFails(
      updateDoc(ref(asMemberA()), { updatedAt: serverTimestamp() })
    );
  });

  it('the lead can no longer backfill or change orgId/buildingId', async () => {
    await assertFails(
      updateDoc(ref(asMemberA()), {
        orgId: 'org-1',
        buildingId: 'bldg-1',
        updatedAt: 2,
      })
    );
  });

  it('a member can no longer set the shared sheet URL or toggle features', async () => {
    await assertFails(
      updateDoc(ref(asMemberB()), {
        sharedSheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit',
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(ref(asMemberB()), { features: { notes: true }, updatedAt: 2 })
    );
  });

  it('a co-lead can no longer set the cadence or rename the norming levels', async () => {
    await setRoleB('coLead');
    await assertFails(
      updateDoc(ref(asMemberB()), {
        meetingCadence: { frequency: 'weekly', weekday: 4, time: '15:15' },
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(ref(asMemberB()), {
        normingLevelLabels: {
          high: 'Exceeds',
          medium: 'Meets',
          low: 'Partially meets',
        },
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('a non-member cannot self-add with a pending invite', async () => {
    await seedPendingInvite(NON_MEMBER_EMAIL);
    await assertFails(
      updateDoc(ref(asNonMemberVerified()), {
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

  it('a non-lead member can no longer self-remove', async () => {
    await assertFails(
      updateDoc(ref(asMemberB()), {
        memberUids: [MEMBER_A_UID],
        memberEmails: { [MEMBER_A_UID]: MEMBER_A_EMAIL },
        updatedAt: 2,
      })
    );
  });

  it('the lead can no longer hand over leadership or add a member directly', async () => {
    await assertFails(
      updateDoc(ref(asMemberA()), { leadUid: MEMBER_B_UID, updatedAt: 2 })
    );
    await assertFails(
      updateDoc(ref(asMemberA()), {
        memberUids: [MEMBER_A_UID, MEMBER_B_UID, NON_MEMBER_UID],
        updatedAt: 2,
      })
    );
  });

  it('a non-member cannot write the root', async () => {
    await assertFails(
      updateDoc(ref(asNonMember()), { name: 'x', updatedAt: 2 })
    );
  });
});

describe('plcs/{plcId} — delete refused', () => {
  it('neither the lead nor a member nor a non-member can dissolve the PLC directly', async () => {
    await assertFails(deleteDoc(doc(asMemberA(), `plcs/${PLC_ID}`)));
    await assertFails(deleteDoc(doc(asMemberB(), `plcs/${PLC_ID}`)));
    await assertFails(deleteDoc(doc(asNonMember(), `plcs/${PLC_ID}`)));
  });
});
