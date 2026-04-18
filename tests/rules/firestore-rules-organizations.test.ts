// Firestore security-rules tests for the Organization hierarchy (Phase 1).
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
// which wraps this file in `firebase emulators:exec --only firestore`.
//
// Covers Phase 1 acceptance checks:
//   - Org members can read /organizations/{orgId} and sub-collections
//   - Non-members are denied reads (including super-admin bypass via
//     admin_settings/user_roles.superAdmins)
//   - All writes to organization/** are denied (Phase 3 wires these)
//   - Legacy /admins/{email} reads still work for the owning user (no regression)

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-rules-test';
const ORG_ID = 'orono';
const MEMBER_EMAIL = 'paul.ivers@orono.k12.mn.us';
const OUTSIDER_EMAIL = 'outsider@example.com';
const SUPER_EMAIL = 'super@spartboard.io';

// ESM-safe path resolution — the repo is `"type": "module"`, so __dirname is
// not defined and we locate firestore.rules via import.meta.url instead.
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

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

  // Seed org, member, role, building, domain, super-admin list using privileged context.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${ORG_ID}`), {
      id: ORG_ID,
      name: 'Orono',
      plan: 'full',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`), {
      email: MEMBER_EMAIL,
      orgId: ORG_ID,
      roleId: 'domain_admin',
      status: 'active',
      buildingIds: [],
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/roles/domain_admin`), {
      id: 'domain_admin',
      name: 'Domain admin',
      system: true,
      perms: {},
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/buildings/high`), {
      id: 'high',
      orgId: ORG_ID,
      name: 'Orono High',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/domains/primary`), {
      id: 'primary',
      orgId: ORG_ID,
      domain: '@orono.k12.mn.us',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/studentPageConfig/default`), {
      orgId: ORG_ID,
      heroText: 'Hi',
    });
    await setDoc(doc(db, 'admin_settings/user_roles'), {
      superAdmins: [SUPER_EMAIL],
    });
    // Legacy admin record used by the unchanged isAdmin() rule.
    await setDoc(doc(db, `admins/${MEMBER_EMAIL}`), {
      email: MEMBER_EMAIL,
    });
  });
});

const asMember = () =>
  testEnv
    .authenticatedContext('member-uid', { email: MEMBER_EMAIL })
    .firestore();
const asOutsider = () =>
  testEnv
    .authenticatedContext('outsider-uid', { email: OUTSIDER_EMAIL })
    .firestore();
const asSuper = () =>
  testEnv.authenticatedContext('super-uid', { email: SUPER_EMAIL }).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

describe('organizations — reads', () => {
  it('member can read the org doc', async () => {
    await assertSucceeds(getDoc(doc(asMember(), `organizations/${ORG_ID}`)));
  });

  it('member can read buildings, domains, roles, members, studentPageConfig', async () => {
    await assertSucceeds(
      getDoc(doc(asMember(), `organizations/${ORG_ID}/buildings/high`))
    );
    await assertSucceeds(
      getDoc(doc(asMember(), `organizations/${ORG_ID}/domains/primary`))
    );
    await assertSucceeds(
      getDoc(doc(asMember(), `organizations/${ORG_ID}/roles/domain_admin`))
    );
    await assertSucceeds(
      getDoc(doc(asMember(), `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`))
    );
    await assertSucceeds(
      getDoc(
        doc(asMember(), `organizations/${ORG_ID}/studentPageConfig/default`)
      )
    );
  });

  it('super admin (legacy user_roles) can read every org', async () => {
    await assertSucceeds(getDoc(doc(asSuper(), `organizations/${ORG_ID}`)));
    await assertSucceeds(
      getDoc(doc(asSuper(), `organizations/${ORG_ID}/buildings/high`))
    );
  });

  it('non-member cannot read the org doc or sub-collections', async () => {
    await assertFails(getDoc(doc(asOutsider(), `organizations/${ORG_ID}`)));
    await assertFails(
      getDoc(doc(asOutsider(), `organizations/${ORG_ID}/buildings/high`))
    );
    await assertFails(
      getDoc(doc(asOutsider(), `organizations/${ORG_ID}/roles/domain_admin`))
    );
  });

  it('non-member CAN read their own (absent) member doc to bootstrap useAuth', async () => {
    // Reading /organizations/{orgId}/members/{myEmail} must succeed even if
    // the doc does not exist — the auth layer uses this probe to decide
    // whether the user has an org membership.
    await assertSucceeds(
      getDoc(
        doc(asOutsider(), `organizations/${ORG_ID}/members/${OUTSIDER_EMAIL}`)
      )
    );
  });

  it('non-member cannot read another user\u2019s member doc', async () => {
    // Self-probe is the ONLY reason a non-member can read /members/*.
    // Reading some other user's membership must fall through to the
    // isOrgMember / isSuperAdmin clauses and be denied.
    await assertFails(
      getDoc(
        doc(asOutsider(), `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`)
      )
    );
  });

  it('unauthenticated users cannot read org data', async () => {
    await assertFails(getDoc(doc(asAnon(), `organizations/${ORG_ID}`)));
    await assertFails(
      getDoc(doc(asAnon(), `organizations/${ORG_ID}/buildings/high`))
    );
  });
});

describe('organizations — writes (all blocked in Phase 1)', () => {
  it('member cannot write the org doc', async () => {
    await assertFails(
      setDoc(doc(asMember(), `organizations/${ORG_ID}`), { name: 'Changed' })
    );
  });

  it('member cannot write buildings, domains, roles, members, studentPageConfig', async () => {
    await assertFails(
      setDoc(doc(asMember(), `organizations/${ORG_ID}/buildings/new`), {
        name: 'X',
      })
    );
    await assertFails(
      setDoc(doc(asMember(), `organizations/${ORG_ID}/domains/new`), {
        domain: '@x.com',
      })
    );
    await assertFails(
      setDoc(doc(asMember(), `organizations/${ORG_ID}/roles/custom`), {
        name: 'Custom',
      })
    );
    await assertFails(
      setDoc(
        doc(asMember(), `organizations/${ORG_ID}/members/new@example.com`),
        { roleId: 'teacher' }
      )
    );
    await assertFails(
      setDoc(
        doc(asMember(), `organizations/${ORG_ID}/studentPageConfig/default`),
        { heroText: 'Hacked' }
      )
    );
  });

  it('super admin cannot write either (Phase 3 will enable)', async () => {
    await assertFails(
      setDoc(doc(asSuper(), `organizations/${ORG_ID}`), { name: 'Changed' })
    );
  });

  it('invitations collection is fully locked from clients', async () => {
    await assertFails(
      getDoc(doc(asMember(), `organizations/${ORG_ID}/invitations/token-123`))
    );
    await assertFails(
      setDoc(doc(asMember(), `organizations/${ORG_ID}/invitations/token-123`), {
        email: 'x@y.com',
      })
    );
  });
});

describe('no regression on legacy /admins/{email}', () => {
  it('owning user can still read their own admin doc', async () => {
    await assertSucceeds(getDoc(doc(asMember(), `admins/${MEMBER_EMAIL}`)));
  });

  it('other users still cannot read another admin doc', async () => {
    await assertFails(getDoc(doc(asOutsider(), `admins/${MEMBER_EMAIL}`)));
  });
});
