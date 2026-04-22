// Firestore security-rules tests for the Organization hierarchy.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
// which wraps this file in `firebase emulators:exec --only firestore`.
//
// Covers:
//   Phase 1 reads — org members can read sub-collections; outsiders blocked
//   (except own member-doc probe); legacy /admins/{email} still works.
//   Phase 3 writes — scoped writes enabled per role:
//     * super admin: org create/delete; any field on any org
//     * domain admin: update identity fields on own org (NOT aiEnabled/plan);
//       full CRUD on buildings/domains/roles (custom only)/members/
//       studentPageConfig
//     * building admin: read-only everywhere, with two exceptions —
//       (a) update buildings they manage, and
//       (b) update `status` (only) on members whose buildingIds intersect
//           the actor's buildingIds
//     * system roles (`system: true`) are immutable from clients
//     * invitations collection stays fully locked (Phase 4 wires it).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, deleteDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-rules-test';
const ORG_ID = 'orono';
const OTHER_ORG_ID = 'other-district';
const MEMBER_EMAIL = 'paul.ivers@orono.k12.mn.us';
const DOMAIN_ADMIN_EMAIL = MEMBER_EMAIL;
const BUILDING_ADMIN_EMAIL = 'bldg.admin@orono.k12.mn.us';
const TEACHER_EMAIL = 'teacher@orono.k12.mn.us';
const OUT_OF_SCOPE_MEMBER_EMAIL = 'other.building@orono.k12.mn.us';
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

  // Seed org, members, roles, buildings, domains, super-admin list using
  // privileged context. Membership shape mirrors what the Phase 1 migration
  // script writes: domain admin + building admin scoped to 'high', a teacher
  // in 'middle', and an "out of scope" member in 'elementary'.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${ORG_ID}`), {
      id: ORG_ID,
      name: 'Orono',
      shortName: 'Orono',
      shortCode: 'OPS',
      state: 'MN',
      plan: 'full',
      aiEnabled: true,
      primaryAdminEmail: DOMAIN_ADMIN_EMAIL,
      createdAt: '2026-01-01',
      users: 4,
      buildings: 1,
      status: 'active',
      seedColor: 'bg-indigo-600',
    });
    await setDoc(doc(db, `organizations/${OTHER_ORG_ID}`), {
      id: OTHER_ORG_ID,
      name: 'Other',
      plan: 'basic',
      aiEnabled: false,
    });

    // Members
    await setDoc(
      doc(db, `organizations/${ORG_ID}/members/${DOMAIN_ADMIN_EMAIL}`),
      {
        email: DOMAIN_ADMIN_EMAIL,
        orgId: ORG_ID,
        roleId: 'domain_admin',
        status: 'active',
        buildingIds: ['high', 'middle'],
      }
    );
    await setDoc(
      doc(db, `organizations/${ORG_ID}/members/${BUILDING_ADMIN_EMAIL}`),
      {
        email: BUILDING_ADMIN_EMAIL,
        orgId: ORG_ID,
        roleId: 'building_admin',
        status: 'active',
        buildingIds: ['high'],
      }
    );
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`), {
      email: TEACHER_EMAIL,
      orgId: ORG_ID,
      roleId: 'teacher',
      status: 'active',
      buildingIds: ['high'], // in the building admin's scope
    });
    await setDoc(
      doc(db, `organizations/${ORG_ID}/members/${OUT_OF_SCOPE_MEMBER_EMAIL}`),
      {
        email: OUT_OF_SCOPE_MEMBER_EMAIL,
        orgId: ORG_ID,
        roleId: 'teacher',
        status: 'active',
        buildingIds: ['elementary'], // NOT in building admin's scope
      }
    );

    // Roles — system + a custom one used by Phase 3 update tests.
    await setDoc(doc(db, `organizations/${ORG_ID}/roles/domain_admin`), {
      id: 'domain_admin',
      name: 'Domain admin',
      system: true,
      perms: {},
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/roles/building_admin`), {
      id: 'building_admin',
      name: 'Building admin',
      system: true,
      perms: {},
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/roles/teacher`), {
      id: 'teacher',
      name: 'Teacher',
      system: true,
      perms: {},
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/roles/custom-coach`), {
      id: 'custom-coach',
      name: 'Instructional Coach',
      system: false,
      perms: {},
    });

    // Buildings
    await setDoc(doc(db, `organizations/${ORG_ID}/buildings/high`), {
      id: 'high',
      orgId: ORG_ID,
      name: 'Orono High',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/buildings/middle`), {
      id: 'middle',
      orgId: ORG_ID,
      name: 'Orono Middle',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/buildings/elementary`), {
      id: 'elementary',
      orgId: ORG_ID,
      name: 'Orono Elementary',
    });

    // Domains + student page config
    await setDoc(doc(db, `organizations/${ORG_ID}/domains/primary`), {
      id: 'primary',
      orgId: ORG_ID,
      domain: '@orono.k12.mn.us',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/studentPageConfig/default`), {
      orgId: ORG_ID,
      heroText: 'Hi',
    });

    // Super admin list (legacy)
    await setDoc(doc(db, 'admin_settings/user_roles'), {
      superAdmins: [SUPER_EMAIL],
    });
    // Legacy admin record used by the unchanged isAdmin() rule.
    await setDoc(doc(db, `admins/${DOMAIN_ADMIN_EMAIL}`), {
      email: DOMAIN_ADMIN_EMAIL,
    });
  });
});

const asDomainAdmin = () =>
  testEnv
    .authenticatedContext('member-uid', { email: DOMAIN_ADMIN_EMAIL })
    .firestore();
const asBuildingAdmin = () =>
  testEnv
    .authenticatedContext('bldg-uid', { email: BUILDING_ADMIN_EMAIL })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext('teacher-uid', { email: TEACHER_EMAIL })
    .firestore();
const asOutsider = () =>
  testEnv
    .authenticatedContext('outsider-uid', { email: OUTSIDER_EMAIL })
    .firestore();
const asSuper = () =>
  testEnv.authenticatedContext('super-uid', { email: SUPER_EMAIL }).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

describe('organizations — reads (Phase 1)', () => {
  it('member can read the org doc', async () => {
    await assertSucceeds(
      getDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`))
    );
  });

  it('member can read buildings, domains, roles, members, studentPageConfig', async () => {
    await assertSucceeds(
      getDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/high`))
    );
    await assertSucceeds(
      getDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/primary`))
    );
    await assertSucceeds(
      getDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/domain_admin`))
    );
    await assertSucceeds(
      getDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`)
      )
    );
    await assertSucceeds(
      getDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/studentPageConfig/default`
        )
      )
    );
  });

  it('super admin (legacy user_roles) can read every org', async () => {
    await assertSucceeds(getDoc(doc(asSuper(), `organizations/${ORG_ID}`)));
    await assertSucceeds(
      getDoc(doc(asSuper(), `organizations/${OTHER_ORG_ID}`))
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
    await assertSucceeds(
      getDoc(
        doc(asOutsider(), `organizations/${ORG_ID}/members/${OUTSIDER_EMAIL}`)
      )
    );
  });

  it("non-member cannot read another user's member doc", async () => {
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

describe('organizations — super admin writes (Phase 3)', () => {
  it('super admin can create an org', async () => {
    await assertSucceeds(
      setDoc(doc(asSuper(), 'organizations/new-org'), {
        id: 'new-org',
        name: 'New',
        plan: 'basic',
        aiEnabled: false,
      })
    );
  });

  it('super admin can delete an org', async () => {
    await assertSucceeds(
      deleteDoc(doc(asSuper(), `organizations/${OTHER_ORG_ID}`))
    );
  });

  it('super admin can flip aiEnabled / plan', async () => {
    await assertSucceeds(
      updateDoc(doc(asSuper(), `organizations/${ORG_ID}`), {
        aiEnabled: false,
        plan: 'expanded',
      })
    );
  });

  it('domain admin cannot create an org', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), 'organizations/nope'), { name: 'Nope' })
    );
  });

  it('domain admin cannot delete their own org', async () => {
    await assertFails(
      deleteDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`))
    );
  });
});

describe('organizations — domain admin writes on own org', () => {
  it('can update identity fields (name, shortName, seedColor, supportUrl)', async () => {
    await assertSucceeds(
      updateDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`), {
        name: 'Orono Public Schools',
        shortName: 'Orono',
        seedColor: 'bg-emerald-600',
        supportUrl: 'https://orono.k12.mn.us/support',
      })
    );
  });

  it('cannot flip aiEnabled', async () => {
    await assertFails(
      updateDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`), {
        aiEnabled: false,
      })
    );
  });

  it('cannot change plan', async () => {
    await assertFails(
      updateDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`), {
        plan: 'basic',
      })
    );
  });

  it('cannot change status (archive is super-admin-only)', async () => {
    await assertFails(
      updateDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`), {
        status: 'archived',
      })
    );
  });

  it('cannot overwrite derived counts (users, buildings)', async () => {
    await assertFails(
      updateDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`), {
        users: 9999,
      })
    );
    await assertFails(
      updateDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`), {
        buildings: 9999,
      })
    );
  });

  it('cannot edit another org', async () => {
    await assertFails(
      updateDoc(doc(asDomainAdmin(), `organizations/${OTHER_ORG_ID}`), {
        name: 'Hijacked',
      })
    );
  });
});

describe('organizations — building admin writes on org doc (denied)', () => {
  it('building admin cannot update org identity fields', async () => {
    await assertFails(
      updateDoc(doc(asBuildingAdmin(), `organizations/${ORG_ID}`), {
        name: 'Nope',
      })
    );
  });

  it('teacher cannot update org doc', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), `organizations/${ORG_ID}`), { name: 'Nope' })
    );
  });
});

describe('organizations/buildings — writes', () => {
  it('domain admin can create, update, delete any building', async () => {
    await assertSucceeds(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/new`), {
        id: 'new',
        orgId: ORG_ID,
        name: 'New School',
        users: 0,
      })
    );
    await assertSucceeds(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/middle`),
        { name: 'Orono Middle School' }
      )
    );
    await assertSucceeds(
      deleteDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/elementary`)
      )
    );
  });

  it('domain admin cannot create a building whose orgId != path orgId', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/sneaky`), {
        id: 'sneaky',
        orgId: OTHER_ORG_ID, // spoofed parent
        name: 'Sneaky',
        users: 0,
      })
    );
  });

  it('domain admin cannot create a building whose id != path buildingId', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/real`), {
        id: 'fake',
        orgId: ORG_ID,
        name: 'Mismatch',
        users: 0,
      })
    );
  });

  it('domain admin cannot create a building with users != 0', async () => {
    await assertFails(
      setDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/inflate`),
        {
          id: 'inflate',
          orgId: ORG_ID,
          name: 'Inflated',
          users: 9999, // derived count — server-managed
        }
      )
    );
  });

  it('domain admin cannot create a building with unknown keys', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/extra`), {
        id: 'extra',
        orgId: ORG_ID,
        name: 'Extra',
        users: 0,
        secretField: 'nope', // not in the whitelist
      })
    );
  });

  it('domain admin cannot mutate derived `users` on a building', async () => {
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/high`),
        { users: 9999 }
      )
    );
  });

  it('building admin can update a building in their scope', async () => {
    await assertSucceeds(
      updateDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/buildings/high`),
        { address: '123 Spartan Way' }
      )
    );
  });

  it('building admin cannot rewrite a building identity field', async () => {
    await assertFails(
      updateDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/buildings/high`),
        { orgId: OTHER_ORG_ID }
      )
    );
    await assertFails(
      updateDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/buildings/high`),
        { id: 'renamed' }
      )
    );
  });

  it('domain admin cannot rewrite a building identity field', async () => {
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/buildings/high`),
        { orgId: OTHER_ORG_ID }
      )
    );
  });

  it('building admin cannot update a building outside their scope', async () => {
    await assertFails(
      updateDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/buildings/middle`),
        { address: 'nope' }
      )
    );
  });

  it('building admin cannot create or delete buildings', async () => {
    await assertFails(
      setDoc(doc(asBuildingAdmin(), `organizations/${ORG_ID}/buildings/new`), {
        id: 'new',
        orgId: ORG_ID,
        name: 'X',
        users: 0,
      })
    );
    await assertFails(
      deleteDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/buildings/high`)
      )
    );
  });

  it('teacher cannot update a building', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), `organizations/${ORG_ID}/buildings/high`), {
        name: 'nope',
      })
    );
  });
});

describe('organizations/domains — writes', () => {
  const pendingDomain = (id: string, domain: string) => ({
    id,
    orgId: ORG_ID,
    domain,
    authMethod: 'google',
    status: 'pending',
    role: 'staff',
    users: 0,
    addedAt: '2026-01-01',
  });

  it('domain admin can create, update, delete domains', async () => {
    await assertSucceeds(
      setDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/students`),
        pendingDomain('students', '@students.orono.k12.mn.us')
      )
    );
    await assertSucceeds(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/primary`),
        { authMethod: 'google' }
      )
    );
    await assertSucceeds(
      deleteDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/primary`))
    );
  });

  it('domain admin cannot create a domain whose orgId != path orgId', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/sneaky`), {
        ...pendingDomain('sneaky', '@x.com'),
        orgId: OTHER_ORG_ID,
      })
    );
  });

  it('domain admin cannot create a domain whose id != path domainId', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/real`), {
        ...pendingDomain('fake', '@x.com'),
      })
    );
  });

  it('domain admin cannot seed status:verified on create (server-managed)', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/spoof`), {
        ...pendingDomain('spoof', '@spoof.com'),
        status: 'verified',
      })
    );
  });

  it('domain admin cannot seed a nonzero users count on create', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/inflate`), {
        ...pendingDomain('inflate', '@inflate.com'),
        users: 9999,
      })
    );
  });

  it('domain admin cannot attach arbitrary fields on create (hasOnly)', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/extra`), {
        ...pendingDomain('extra', '@extra.com'),
        secretNote: 'stash',
      })
    );
  });

  it('domain admin cannot flip status (server-managed) via update', async () => {
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/primary`),
        { status: 'verified' }
      )
    );
  });

  it('domain admin cannot overwrite derived users count or addedAt', async () => {
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/primary`),
        { users: 9999 }
      )
    );
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/primary`),
        { addedAt: '2020-01-01' }
      )
    );
  });

  it('domain admin cannot rewrite a domain identity field', async () => {
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/domains/primary`),
        { orgId: OTHER_ORG_ID }
      )
    );
  });

  it('building admin cannot write domains', async () => {
    await assertFails(
      setDoc(doc(asBuildingAdmin(), `organizations/${ORG_ID}/domains/new`), {
        ...pendingDomain('new', '@x.com'),
      })
    );
    await assertFails(
      updateDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/domains/primary`),
        { authMethod: 'saml' }
      )
    );
    await assertFails(
      deleteDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/domains/primary`)
      )
    );
  });
});

describe('organizations/roles — writes (system role protection)', () => {
  it('domain admin can create a custom role (system:false)', async () => {
    await assertSucceeds(
      setDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/custom-specialist`),
        {
          id: 'custom-specialist',
          name: 'Specialist',
          system: false,
          perms: {},
        }
      )
    );
  });

  it('domain admin cannot create a role with system:true', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/hacked`), {
        id: 'hacked',
        name: 'Hacked',
        system: true,
        perms: {},
      })
    );
  });

  it('domain admin cannot create a role whose id != path roleId', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/real`), {
        id: 'fake',
        name: 'Mismatch',
        system: false,
        perms: {},
      })
    );
  });

  it('domain admin can update a custom role', async () => {
    await assertSucceeds(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/custom-coach`),
        { name: 'Instructional Coach (renamed)' }
      )
    );
  });

  it('domain admin cannot update a system role', async () => {
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/domain_admin`),
        { name: 'Renamed' }
      )
    );
  });

  it('domain admin cannot flip system:true to false', async () => {
    // Starting from system:true; request tries to change to false.
    await assertFails(
      updateDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/teacher`), {
        system: false,
      })
    );
  });

  it('domain admin cannot flip system:false to true on a custom role', async () => {
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/custom-coach`),
        { system: true }
      )
    );
  });

  it('domain admin cannot delete a system role', async () => {
    await assertFails(
      deleteDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/domain_admin`)
      )
    );
  });

  it('domain admin can delete a custom role', async () => {
    await assertSucceeds(
      deleteDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/custom-coach`)
      )
    );
  });

  it('domain admin cannot create a role with unknown keys', async () => {
    await assertFails(
      setDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/custom-extra`),
        {
          id: 'custom-extra',
          name: 'Extra',
          system: false,
          perms: {},
          secretField: 'nope', // not in the whitelist
        }
      )
    );
  });

  it('domain admin cannot create a role missing required fields', async () => {
    await assertFails(
      setDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/custom-thin`),
        {
          id: 'custom-thin',
          name: 'Thin',
          system: false,
          // perms omitted — required by hasAll
        }
      )
    );
  });

  it('domain admin cannot update a custom role with unknown keys', async () => {
    await assertFails(
      updateDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/roles/custom-coach`),
        { secretField: 'nope' }
      )
    );
  });

  it('building admin cannot create or update roles', async () => {
    await assertFails(
      setDoc(doc(asBuildingAdmin(), `organizations/${ORG_ID}/roles/custom-x`), {
        id: 'custom-x',
        name: 'X',
        system: false,
        perms: {},
      })
    );
    await assertFails(
      updateDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/roles/custom-coach`),
        { name: 'hack' }
      )
    );
  });

  it('super admin can update perms on a system role', async () => {
    await assertSucceeds(
      updateDoc(doc(asSuper(), `organizations/${ORG_ID}/roles/domain_admin`), {
        perms: { viewBoards: 'full' },
      })
    );
  });

  it('super admin cannot change non-perms fields on a system role', async () => {
    await assertFails(
      updateDoc(doc(asSuper(), `organizations/${ORG_ID}/roles/teacher`), {
        name: 'Renamed system role',
      })
    );
  });

  it('super admin cannot flip system:true to false', async () => {
    await assertFails(
      updateDoc(doc(asSuper(), `organizations/${ORG_ID}/roles/teacher`), {
        system: false,
      })
    );
  });

  it('super admin can still update name/perms on a custom role', async () => {
    await assertSucceeds(
      updateDoc(doc(asSuper(), `organizations/${ORG_ID}/roles/custom-coach`), {
        name: 'Coach (super renamed)',
        perms: { viewBoards: 'building' },
      })
    );
  });
});

describe('organizations/members — writes', () => {
  const validMember = (email: string) => ({
    email,
    orgId: ORG_ID,
    roleId: 'teacher',
    status: 'invited',
    buildingIds: ['high'],
  });

  it('domain admin can create a new member', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/new.teacher@orono.k12.mn.us`
        ),
        validMember('new.teacher@orono.k12.mn.us')
      )
    );
  });

  it('domain admin cannot create a member whose email != doc id', async () => {
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/expected@orono.k12.mn.us`
        ),
        validMember('someoneelse@orono.k12.mn.us')
      )
    );
  });

  it('domain admin cannot create a member whose orgId != path orgId', async () => {
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/xorg@orono.k12.mn.us`
        ),
        { ...validMember('xorg@orono.k12.mn.us'), orgId: OTHER_ORG_ID }
      )
    );
  });

  it('domain admin cannot create a member missing required fields', async () => {
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/missing@orono.k12.mn.us`
        ),
        {
          email: 'missing@orono.k12.mn.us',
          orgId: ORG_ID,
          // roleId, status, buildingIds all missing
        }
      )
    );
  });

  it('domain admin cannot create a member with arbitrary extra fields', async () => {
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/extra@orono.k12.mn.us`
        ),
        { ...validMember('extra@orono.k12.mn.us'), isSuperAdmin: true }
      )
    );
  });

  it('domain admin cannot create a member with a mixed-case doc id', async () => {
    // isOrgMember() always looks up members/{token.email.lower()}, so a
    // mixed-case id would be orphaned and never found.
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/Mixed.Case@orono.k12.mn.us`
        ),
        validMember('mixed.case@orono.k12.mn.us')
      )
    );
  });

  it('domain admin cannot create a member with a mixed-case email field', async () => {
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/mixed.case@orono.k12.mn.us`
        ),
        validMember('Mixed.Case@orono.k12.mn.us')
      )
    );
  });

  it('domain admin can update roleId and buildingIds', async () => {
    await assertSucceeds(
      updateDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { roleId: 'building_admin', buildingIds: ['high', 'middle'] }
      )
    );
  });

  it('domain admin cannot spoof member identity (email, orgId, uid)', async () => {
    await assertFails(
      updateDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { email: 'other@example.com' }
      )
    );
    await assertFails(
      updateDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { orgId: OTHER_ORG_ID }
      )
    );
    await assertFails(
      updateDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { uid: 'impostor-uid' }
      )
    );
  });

  it('domain admin cannot add arbitrary fields to a member doc', async () => {
    await assertFails(
      updateDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { isSuperAdmin: true }
      )
    );
  });

  it('domain admin can delete a member', async () => {
    await assertSucceeds(
      deleteDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`)
      )
    );
  });

  it('building admin can update status for a member in their scope', async () => {
    // TEACHER_EMAIL has buildingIds: ['high'] which intersects bldg admin's ['high'].
    await assertSucceeds(
      updateDoc(
        doc(
          asBuildingAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { status: 'inactive' }
      )
    );
  });

  it('building admin cannot change roleId even within scope', async () => {
    await assertFails(
      updateDoc(
        doc(
          asBuildingAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { roleId: 'domain_admin' }
      )
    );
  });

  it('building admin cannot change buildingIds even within scope', async () => {
    await assertFails(
      updateDoc(
        doc(
          asBuildingAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { buildingIds: ['high', 'elementary'] }
      )
    );
  });

  it('building admin cannot update members outside their scope', async () => {
    await assertFails(
      updateDoc(
        doc(
          asBuildingAdmin(),
          `organizations/${ORG_ID}/members/${OUT_OF_SCOPE_MEMBER_EMAIL}`
        ),
        { status: 'inactive' }
      )
    );
  });

  it('building admin cannot create or delete members', async () => {
    await assertFails(
      setDoc(
        doc(
          asBuildingAdmin(),
          `organizations/${ORG_ID}/members/new@orono.k12.mn.us`
        ),
        validMember('new@orono.k12.mn.us')
      )
    );
    await assertFails(
      deleteDoc(
        doc(
          asBuildingAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        )
      )
    );
  });

  it('teacher cannot update any member', async () => {
    await assertFails(
      updateDoc(
        doc(asTeacher(), `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`),
        { status: 'inactive' }
      )
    );
  });
});

describe('organizations/studentPageConfig — writes', () => {
  it('domain admin can update student page config', async () => {
    await assertSucceeds(
      updateDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/studentPageConfig/default`
        ),
        { heroText: 'Welcome Spartans!', accentColor: '#ad2122' }
      )
    );
  });

  it('super admin can update student page config', async () => {
    await assertSucceeds(
      updateDoc(
        doc(asSuper(), `organizations/${ORG_ID}/studentPageConfig/default`),
        { heroText: 'From super' }
      )
    );
  });

  it('building admin cannot update student page config', async () => {
    await assertFails(
      updateDoc(
        doc(
          asBuildingAdmin(),
          `organizations/${ORG_ID}/studentPageConfig/default`
        ),
        { heroText: 'nope' }
      )
    );
  });

  it('teacher cannot update student page config', async () => {
    await assertFails(
      updateDoc(
        doc(asTeacher(), `organizations/${ORG_ID}/studentPageConfig/default`),
        { heroText: 'nope' }
      )
    );
  });

  it('domain admin cannot create a non-default student page config', async () => {
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/studentPageConfig/sneaky`
        ),
        { orgId: ORG_ID, heroText: 'sneaky' }
      )
    );
  });

  it('super admin cannot delete the student page config', async () => {
    await assertFails(
      deleteDoc(
        doc(asSuper(), `organizations/${ORG_ID}/studentPageConfig/default`)
      )
    );
  });

  it('domain admin cannot create student page config with mismatched orgId', async () => {
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/studentPageConfig/default`
        ),
        { orgId: OTHER_ORG_ID, heroText: 'spoof' }
      )
    );
  });

  it('domain admin cannot create student page config with unknown keys', async () => {
    await assertFails(
      setDoc(
        doc(
          asDomainAdmin(),
          `organizations/${ORG_ID}/studentPageConfig/default`
        ),
        {
          orgId: ORG_ID,
          heroText: 'Hi',
          secretField: 'nope', // not in whitelist
        }
      )
    );
  });
});

describe('organizations/invitations — fully locked from every client role (Phase 4)', () => {
  // The invitations collection is owned entirely by Cloud Functions. The
  // `createOrganizationInvites` and `claimOrganizationInvite` callables use
  // the Admin SDK which bypasses rules; every client path must hit these
  // denies. If anyone ever adds a client-visible path to invitations, this
  // suite catches it.

  it('domain admin cannot read, write, or delete invitations from the client', async () => {
    await assertFails(
      getDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/invitations/token-da`)
      )
    );
    await assertFails(
      setDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/invitations/token-da`),
        { email: 'x@y.com' }
      )
    );
    await assertFails(
      deleteDoc(
        doc(asDomainAdmin(), `organizations/${ORG_ID}/invitations/token-da`)
      )
    );
  });

  it('super admin cannot read or write invitations from the client', async () => {
    // Super admins have bypass-level access almost everywhere else, but
    // invitations stay CF-only so the contract is simple: invite lifecycle
    // is never half-managed across client + CF. Anything super admins need
    // to do goes through the callable.
    await assertFails(
      getDoc(doc(asSuper(), `organizations/${ORG_ID}/invitations/token-super`))
    );
    await assertFails(
      setDoc(
        doc(asSuper(), `organizations/${ORG_ID}/invitations/token-super`),
        { email: 'x@y.com' }
      )
    );
  });

  it('building admin, teacher, and outsider cannot read or write invitations', async () => {
    await assertFails(
      getDoc(
        doc(asBuildingAdmin(), `organizations/${ORG_ID}/invitations/token-ba`)
      )
    );
    await assertFails(
      getDoc(doc(asTeacher(), `organizations/${ORG_ID}/invitations/token-t`))
    );
    await assertFails(
      getDoc(doc(asOutsider(), `organizations/${ORG_ID}/invitations/token-o`))
    );
  });
});

describe('organizations/members — uid write restricted to Cloud Functions (Phase 4)', () => {
  // Phase 4 first-sign-in links a member's uid to their Google auth uid. This
  // MUST go through the `claimOrganizationInvite` callable — the Admin SDK
  // bypasses rules and can legally write `uid`. A client-writable path would
  // let any writer reassign a member's uid, hijacking the linked account.
  // The member-update whitelist at firestore.rules:228 intentionally excludes
  // `uid`; these tests codify that decision across every non-super-admin
  // actor that can reach the member collection.

  it('teacher cannot write uid on their own member doc', async () => {
    // Teachers have no direct write access to member docs at all. This is
    // the attack vector: a malicious invitee tries to set `uid` to their
    // own auth uid to bypass the claim flow.
    await assertFails(
      updateDoc(
        doc(asTeacher(), `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`),
        { uid: 'teacher-uid' }
      )
    );
  });

  it('building admin cannot write uid on a member doc in their scope', async () => {
    await assertFails(
      updateDoc(
        doc(
          asBuildingAdmin(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { uid: 'impostor-uid' }
      )
    );
  });

  // Domain admin's uid-write rejection is already covered in "domain admin
  // cannot spoof member identity (email, orgId, uid)" above — not duplicated.
});

describe('no regression on legacy /admins/{email}', () => {
  it('owning user can still read their own admin doc', async () => {
    await assertSucceeds(
      getDoc(doc(asDomainAdmin(), `admins/${DOMAIN_ADMIN_EMAIL}`))
    );
  });

  it('other users still cannot read another admin doc', async () => {
    await assertFails(
      getDoc(doc(asOutsider(), `admins/${DOMAIN_ADMIN_EMAIL}`))
    );
  });
});

describe('organizations/testClasses — admin-only read/write', () => {
  // Mock-class allowlist consumed by studentLoginV1 (Admin SDK bypass) and
  // the admin-gated teacher assignment class pickers. Invisible to non-admin
  // teachers so it's safe to leave in prod.
  const TEST_CLASS_PATH = `organizations/${ORG_ID}/testClasses/mock-period-1`;
  const MOCK_CLASS_DATA = {
    title: 'Mock Period 1',
    memberEmails: ['sample-student@orono.k12.mn.us'],
    createdAt: 0,
    createdBy: 'test',
  };

  it('domain admin can read and write testClasses', async () => {
    await assertSucceeds(
      setDoc(doc(asDomainAdmin(), TEST_CLASS_PATH), MOCK_CLASS_DATA)
    );
    await assertSucceeds(getDoc(doc(asDomainAdmin(), TEST_CLASS_PATH)));
  });

  it('super admin can read and write testClasses', async () => {
    await assertSucceeds(
      setDoc(doc(asSuper(), TEST_CLASS_PATH), MOCK_CLASS_DATA)
    );
    await assertSucceeds(getDoc(doc(asSuper(), TEST_CLASS_PATH)));
  });

  it('building admin cannot read or write testClasses', async () => {
    await assertFails(getDoc(doc(asBuildingAdmin(), TEST_CLASS_PATH)));
    await assertFails(
      setDoc(doc(asBuildingAdmin(), TEST_CLASS_PATH), MOCK_CLASS_DATA)
    );
  });

  it('teacher cannot read or write testClasses', async () => {
    await assertFails(getDoc(doc(asTeacher(), TEST_CLASS_PATH)));
    await assertFails(
      setDoc(doc(asTeacher(), TEST_CLASS_PATH), MOCK_CLASS_DATA)
    );
  });

  it('outsider and unauthenticated cannot read or write testClasses', async () => {
    await assertFails(getDoc(doc(asOutsider(), TEST_CLASS_PATH)));
    await assertFails(
      setDoc(doc(asOutsider(), TEST_CLASS_PATH), MOCK_CLASS_DATA)
    );
    await assertFails(getDoc(doc(asAnon(), TEST_CLASS_PATH)));
    await assertFails(setDoc(doc(asAnon(), TEST_CLASS_PATH), MOCK_CLASS_DATA));
  });
});
