// Rules coverage for My Groups group types on the PLC root doc: who can set
// `groupType` and `autoRoster` on create and on the lead's broad update, and
// that typed groups stay readable by members only.
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
import { setDoc, updateDoc, doc, getDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-group-type';
const PLC_ID = 'plc-group-type-test';

const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@example.com';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@example.com';
const OUTSIDER_UID = 'outsider-uid';
const OUTSIDER_EMAIL = 'outsider@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asLead = () =>
  testEnv.authenticatedContext(LEAD_UID, { email: LEAD_EMAIL }).firestore();
const asMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();
const asOutsider = () =>
  testEnv
    .authenticatedContext(OUTSIDER_UID, { email: OUTSIDER_EMAIL })
    .firestore();

const leadMember = {
  uid: LEAD_UID,
  email: LEAD_EMAIL,
  displayName: 'Lead',
  role: 'lead',
  joinedAt: 1,
  status: 'active',
};

/** The doc a teacher writes on create, plus any group fields. */
const newGroup = (extra: Record<string, unknown> = {}) => ({
  name: 'New group',
  orgId: null,
  buildingId: null,
  members: { [LEAD_UID]: leadMember },
  leadUid: LEAD_UID,
  memberUids: [LEAD_UID],
  memberEmails: { [LEAD_UID]: LEAD_EMAIL },
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const seed = async (extra: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Seeded group',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID, MEMBER_UID],
      memberEmails: { [LEAD_UID]: LEAD_EMAIL, [MEMBER_UID]: MEMBER_EMAIL },
      createdAt: 1,
      updatedAt: 1,
      ...extra,
    });
  });
};

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
});

describe('create', () => {
  it('allows a teacher to create a group with no type (a PLC)', async () => {
    await assertSucceeds(setDoc(doc(asLead(), 'plcs/g1'), newGroup()));
  });

  it.each(['plc', 'department', 'mentoring'])(
    'allows a teacher to create a %s group',
    async (groupType) => {
      await assertSucceeds(
        setDoc(doc(asLead(), `plcs/g-${groupType}`), newGroup({ groupType }))
      );
    }
  );

  it('rejects a teacher creating a building group', async () => {
    await assertFails(
      setDoc(doc(asLead(), 'plcs/g2'), newGroup({ groupType: 'building' }))
    );
  });

  it('rejects an unknown group type', async () => {
    await assertFails(
      setDoc(doc(asLead(), 'plcs/g3'), newGroup({ groupType: 'club' }))
    );
  });

  it('rejects a teacher turning on auto-roster', async () => {
    await assertFails(
      setDoc(doc(asLead(), 'plcs/g4'), newGroup({ autoRoster: false }))
    );
  });
});

describe('read', () => {
  it('lets members read a typed group', async () => {
    await seed({ groupType: 'mentoring' });
    await assertSucceeds(getDoc(doc(asMember(), `plcs/${PLC_ID}`)));
    await assertSucceeds(getDoc(doc(asLead(), `plcs/${PLC_ID}`)));
  });

  it('denies non-members reading a building group', async () => {
    await seed({ groupType: 'building', autoRoster: true });
    await assertFails(getDoc(doc(asOutsider(), `plcs/${PLC_ID}`)));
  });
});

describe('lead update', () => {
  it('lets the lead switch between teacher types', async () => {
    await seed({ groupType: 'department' });
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        groupType: 'mentoring',
        updatedAt: 2,
      })
    );
  });

  it('lets the lead set a type on a legacy PLC', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        name: 'Renamed',
        groupType: 'department',
        updatedAt: 2,
      })
    );
  });

  it('rejects the lead making a group a building group', async () => {
    await seed({ groupType: 'plc' });
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        groupType: 'building',
        updatedAt: 2,
      })
    );
  });

  it('rejects the lead changing a building group to another type', async () => {
    await seed({ groupType: 'building' });
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        groupType: 'plc',
        updatedAt: 2,
      })
    );
  });

  it('lets the lead rename a building group', async () => {
    await seed({ groupType: 'building', autoRoster: true });
    await assertSucceeds(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        name: 'Staff',
        updatedAt: 2,
      })
    );
  });

  it('rejects the lead changing auto-roster', async () => {
    await seed({ groupType: 'building', autoRoster: true });
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        autoRoster: false,
        updatedAt: 2,
      })
    );
  });

  it('rejects a non-lead member changing the type', async () => {
    await seed({ groupType: 'plc' });
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        groupType: 'mentoring',
        updatedAt: 2,
      })
    );
  });

  it('lets a member turn Meeting Mode on through features', async () => {
    await seed({ groupType: 'mentoring' });
    await assertSucceeds(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        features: {
          quizzes: false,
          videoActivities: false,
          notes: true,
          sharedBoards: true,
          printForTeammates: true,
          meeting: true,
        },
        updatedAt: 2,
      })
    );
  });
});
