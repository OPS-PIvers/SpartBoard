// Rules coverage for My Groups group types on the PLC root doc: typed groups
// stay readable by members only, and `groupType` / `autoRoster` can no longer
// be written by a client (plcSettingsV1 does it).
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
  await seedStaff([LEAD_UID]);
});

describe('create refused (plcSettingsV1 creates groups)', () => {
  it.each([undefined, 'plc', 'department', 'mentoring', 'building', 'club'])(
    'a teacher can no longer create a group directly (type %s)',
    async (groupType) => {
      await assertFails(
        setDoc(
          doc(staffDb(LEAD_UID), `plcs/g-${groupType ?? 'none'}`),
          newGroup(groupType ? { groupType } : {})
        )
      );
    }
  );

  it('a teacher cannot create a group with auto-roster', async () => {
    await assertFails(
      setDoc(doc(staffDb(LEAD_UID), 'plcs/g4'), newGroup({ autoRoster: false }))
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

describe('lead and member updates refused (plcSettingsV1 does them)', () => {
  it('the lead can no longer switch type, set a type on a legacy PLC or rename', async () => {
    await seed({ groupType: 'department' });
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        groupType: 'mentoring',
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        name: 'Renamed',
        updatedAt: 2,
      })
    );
  });

  it('the lead can no longer rename a building group or change auto-roster', async () => {
    await seed({ groupType: 'building', autoRoster: true });
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        name: 'Staff',
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(asLead(), `plcs/${PLC_ID}`), {
        autoRoster: false,
        updatedAt: 2,
      })
    );
  });

  it('a member can no longer change the type or turn Meeting Mode on through features', async () => {
    await seed({ groupType: 'mentoring' });
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        groupType: 'plc',
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(asMember(), `plcs/${PLC_ID}`), {
        features: { notes: true, meeting: true },
        updatedAt: 2,
      })
    );
  });
});
