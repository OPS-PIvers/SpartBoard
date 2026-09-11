// Rules coverage for `isAdminEditingPlcMembers`: an in-org site admin may add,
// re-role or remove ONE non-lead member of a PLC in their org, without being a
// member. Requires a running Firestore emulator — `pnpm run test:rules`.

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

const PROJECT_ID = 'spartboard-plc-admin-members';

const ORG_ID = 'org-orono';
const OTHER_ORG_ID = 'org-elsewhere';
const PLC_ID = 'plc-ela9';
const LEGACY_PLC_ID = 'plc-no-org';

const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@orono.k12.mn.us';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@orono.k12.mn.us';
const NEW_UID = 'new-uid';
const NEW_EMAIL = 'new@orono.k12.mn.us';

const ADMIN_UID = 'admin-uid';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';
const ORG_PEER_UID = 'org-peer-uid';
const ORG_PEER_EMAIL = 'peer@orono.k12.mn.us';
const OTHER_ADMIN_UID = 'other-admin-uid';
const OTHER_ADMIN_EMAIL = 'admin@elsewhere.org';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();
const asOrgPeer = () =>
  testEnv
    .authenticatedContext(ORG_PEER_UID, {
      email: ORG_PEER_EMAIL,
      email_verified: true,
    })
    .firestore();
const asOtherAdmin = () =>
  testEnv
    .authenticatedContext(OTHER_ADMIN_UID, {
      email: OTHER_ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();

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

const root = (orgId: string | null) => ({
  name: 'ELA 9',
  ...(orgId ? { orgId } : {}),
  leadUid: LEAD_UID,
  memberUids: [LEAD_UID, MEMBER_UID],
  memberEmails: { [LEAD_UID]: LEAD_EMAIL, [MEMBER_UID]: MEMBER_EMAIL },
  members: {
    [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
    [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
  },
  createdAt: 1,
  updatedAt: 1,
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(db, `admins/${OTHER_ADMIN_EMAIL}`), {});
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
    await setDoc(doc(db, `plcs/${PLC_ID}`), root(ORG_ID));
    await setDoc(doc(db, `plcs/${LEGACY_PLC_ID}`), root(null));
  });
});

// Add NEW as an active member.
const addNew = (overrides: Record<string, unknown> = {}) => ({
  members: {
    [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
    [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
    [NEW_UID]: member(NEW_UID, NEW_EMAIL, 'member'),
  },
  memberUids: [LEAD_UID, MEMBER_UID, NEW_UID],
  memberEmails: {
    [LEAD_UID]: LEAD_EMAIL,
    [MEMBER_UID]: MEMBER_EMAIL,
    [NEW_UID]: NEW_EMAIL,
  },
  adminMemberUid: NEW_UID,
  updatedAt: 2,
  ...overrides,
});

// Remove MEMBER.
const removeMember = (overrides: Record<string, unknown> = {}) => ({
  members: {
    [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
    [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member', 'removed'),
  },
  memberUids: [LEAD_UID],
  memberEmails: { [LEAD_UID]: LEAD_EMAIL },
  adminMemberUid: MEMBER_UID,
  updatedAt: 2,
  ...overrides,
});

describe('plcs/{plcId} update — isAdminEditingPlcMembers', () => {
  it('an in-org admin can add a teacher as a member', async () => {
    await assertSucceeds(updateDoc(doc(asAdmin(), `plcs/${PLC_ID}`), addNew()));
  });

  it('an in-org admin can change a member role', async () => {
    await assertSucceeds(
      updateDoc(doc(asAdmin(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'coLead'),
        },
        memberUids: [LEAD_UID, MEMBER_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL, [MEMBER_UID]: MEMBER_EMAIL },
        adminMemberUid: MEMBER_UID,
        updatedAt: 2,
      })
    );
  });

  it('an in-org admin can remove a member', async () => {
    await assertSucceeds(
      updateDoc(doc(asAdmin(), `plcs/${PLC_ID}`), removeMember())
    );
  });

  it('rejects a same-org non-admin', async () => {
    await assertFails(updateDoc(doc(asOrgPeer(), `plcs/${PLC_ID}`), addNew()));
  });

  it('rejects an admin from another org', async () => {
    await assertFails(
      updateDoc(doc(asOtherAdmin(), `plcs/${PLC_ID}`), addNew())
    );
  });

  it('rejects editing an org-less PLC', async () => {
    await assertFails(
      updateDoc(doc(asAdmin(), `plcs/${LEGACY_PLC_ID}`), addNew())
    );
  });

  it('rejects a missing pointer', async () => {
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${PLC_ID}`),
        addNew({ adminMemberUid: '' })
      )
    );
  });

  it('rejects minting a second lead', async () => {
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${PLC_ID}`),
        addNew({
          members: {
            [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
            [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
            [NEW_UID]: member(NEW_UID, NEW_EMAIL, 'lead'),
          },
        })
      )
    );
  });

  it('rejects touching the sitting lead', async () => {
    await assertFails(
      updateDoc(doc(asAdmin(), `plcs/${PLC_ID}`), {
        members: {
          [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead', 'removed'),
          [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'member'),
        },
        memberUids: [MEMBER_UID],
        memberEmails: { [MEMBER_UID]: MEMBER_EMAIL },
        adminMemberUid: LEAD_UID,
        updatedAt: 2,
      })
    );
  });

  it('rejects changing two entries in one write', async () => {
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${PLC_ID}`),
        addNew({
          members: {
            [LEAD_UID]: member(LEAD_UID, LEAD_EMAIL, 'lead'),
            [MEMBER_UID]: member(MEMBER_UID, MEMBER_EMAIL, 'viewer'),
            [NEW_UID]: member(NEW_UID, NEW_EMAIL, 'member'),
          },
        })
      )
    );
  });

  it('rejects memberUids that disagree with the entry status', async () => {
    await assertFails(
      updateDoc(
        doc(asAdmin(), `plcs/${PLC_ID}`),
        addNew({ memberUids: [LEAD_UID, MEMBER_UID] })
      )
    );
  });

  it('rejects smuggling a rename', async () => {
    await assertFails(
      updateDoc(doc(asAdmin(), `plcs/${PLC_ID}`), addNew({ name: 'Renamed' }))
    );
  });
});
