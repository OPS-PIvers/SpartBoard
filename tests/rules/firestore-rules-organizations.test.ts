// Firestore security-rules tests for the Organization hierarchy.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
// which wraps this file in `firebase emulators:exec --only firestore`.
//
// Covers:
//   Reads: org members can read sub-collections; outsiders blocked (except own
//   member-doc probe); legacy /admins/{email} still works.
//   Writes: orgAdminV1 owns every org, building, domain, role, member and
//   tombstone write, so every client tier is denied except a member's own
//   lastActive stamp; invitations stay fully locked; testClasses stay admin-only.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  doc,
  collection,
  query,
  where,
  limit,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-organizations-rules-test';
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

    // Super admin: an operator-org super_admin member doc.
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${SUPER_EMAIL}`), {
      email: SUPER_EMAIL,
      orgId: ORG_ID,
      roleId: 'super_admin',
      buildingIds: [],
      status: 'active',
    });
    // Legacy admin record used by the unchanged isAdmin() rule.
    await setDoc(doc(db, `admins/${DOMAIN_ADMIN_EMAIL}`), {
      email: DOMAIN_ADMIN_EMAIL,
    });
  });
});

// email_verified: true on every legitimate actor below — a real Google
// Sign-In always sets it; only an unverified/self-reported claim is denied
// (see isDomainAdmin()/isBuildingAdmin()/isOrgMember()/isSuperAdmin() fixes).
const asDomainAdmin = () =>
  testEnv
    .authenticatedContext('member-uid', {
      email: DOMAIN_ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();
const asBuildingAdmin = () =>
  testEnv
    .authenticatedContext('bldg-uid', {
      email: BUILDING_ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext('teacher-uid', {
      email: TEACHER_EMAIL,
      email_verified: true,
    })
    .firestore();
const asOutsider = () =>
  testEnv
    .authenticatedContext('outsider-uid', { email: OUTSIDER_EMAIL })
    .firestore();
const asSuper = () =>
  testEnv
    .authenticatedContext('super-uid', {
      email: SUPER_EMAIL,
      email_verified: true,
    })
    .firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

describe('organizations — reads (Phase 1)', () => {
  it('member can read the org doc', async () => {
    await assertSucceeds(
      getDoc(doc(asDomainAdmin(), `organizations/${ORG_ID}`))
    );
  });

  it('member can read buildings, domains, roles, members', async () => {
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
  });

  it('a teacher can look up a staff member by uid (share import sharer line); an outsider cannot', async () => {
    const byUid = (db: ReturnType<typeof asTeacher>) =>
      getDocs(
        query(
          collection(db, `organizations/${ORG_ID}/members`),
          where('uid', '==', 'member-uid'),
          limit(1)
        )
      );
    await assertSucceeds(byUid(asTeacher()));
    await assertFails(byUid(asOutsider()));
  });

  it('super admin (operator-org member role) can read every org', async () => {
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

describe('organizations — client writes are denied (orgAdminV1 owns them)', () => {
  const actors = () =>
    [
      ['super admin', asSuper()],
      ['domain admin', asDomainAdmin()],
      ['building admin', asBuildingAdmin()],
      ['teacher', asTeacher()],
      ['outsider', asOutsider()],
    ] as const;

  it('nobody creates, updates or deletes an org doc', async () => {
    for (const [, db] of actors()) {
      await assertFails(
        setDoc(doc(db, 'organizations/new-org'), { id: 'new-org', name: 'N' })
      );
      await assertFails(
        updateDoc(doc(db, `organizations/${ORG_ID}`), { name: 'Nope' })
      );
      await assertFails(
        updateDoc(doc(db, `organizations/${ORG_ID}`), {
          claudeManagedAuth: { enabled: true, issuer: 'https://x.example' },
        })
      );
      await assertFails(deleteDoc(doc(db, `organizations/${OTHER_ORG_ID}`)));
    }
  });

  it('nobody writes buildings, domains or roles', async () => {
    for (const [, db] of actors()) {
      const base = `organizations/${ORG_ID}`;
      await assertFails(
        setDoc(doc(db, `${base}/buildings/new`), {
          id: 'new',
          orgId: ORG_ID,
          name: 'New',
          users: 0,
        })
      );
      await assertFails(
        updateDoc(doc(db, `${base}/buildings/high`), { name: 'Renamed' })
      );
      await assertFails(deleteDoc(doc(db, `${base}/buildings/high`)));
      await assertFails(
        setDoc(doc(db, `${base}/domains/new`), {
          id: 'new',
          orgId: ORG_ID,
          domain: '@new.example.org',
          status: 'pending',
          users: 0,
        })
      );
      await assertFails(
        updateDoc(doc(db, `${base}/domains/primary`), { role: 'teacher' })
      );
      await assertFails(deleteDoc(doc(db, `${base}/domains/primary`)));
      await assertFails(
        setDoc(doc(db, `${base}/roles/new-role`), {
          id: 'new-role',
          name: 'New',
          system: false,
          perms: {},
        })
      );
      await assertFails(
        updateDoc(doc(db, `${base}/roles/custom-coach`), { name: 'Coach' })
      );
      await assertFails(
        updateDoc(doc(db, `${base}/roles/domain_admin`), { perms: { x: 1 } })
      );
      await assertFails(deleteDoc(doc(db, `${base}/roles/custom-coach`)));
    }
  });

  it("nobody creates, deletes or edits another member's doc", async () => {
    const members = `organizations/${ORG_ID}/members`;
    for (const [, db] of actors()) {
      await assertFails(
        setDoc(doc(db, `${members}/new.teacher@orono.k12.mn.us`), {
          email: 'new.teacher@orono.k12.mn.us',
          orgId: ORG_ID,
          roleId: 'teacher',
          status: 'invited',
          buildingIds: ['high'],
        })
      );
      await assertFails(
        updateDoc(doc(db, `${members}/${OUT_OF_SCOPE_MEMBER_EMAIL}`), {
          status: 'inactive',
        })
      );
      await assertFails(
        updateDoc(doc(db, `${members}/${OUT_OF_SCOPE_MEMBER_EMAIL}`), {
          lastActive: 'now',
        })
      );
      await assertFails(
        deleteDoc(doc(db, `${members}/${OUT_OF_SCOPE_MEMBER_EMAIL}`))
      );
    }
    await assertFails(
      updateDoc(doc(asBuildingAdmin(), `${members}/${TEACHER_EMAIL}`), {
        status: 'inactive',
      })
    );
  });

  it('a member may stamp only lastActive on their own doc', async () => {
    const own = (db: ReturnType<typeof asTeacher>, email: string) =>
      doc(db, `organizations/${ORG_ID}/members/${email}`);
    await assertSucceeds(
      setDoc(
        own(asTeacher(), TEACHER_EMAIL),
        { lastActive: 'now' },
        {
          merge: true,
        }
      )
    );
    await assertSucceeds(
      updateDoc(own(asDomainAdmin(), DOMAIN_ADMIN_EMAIL), { lastActive: 'now' })
    );
    await assertFails(
      updateDoc(own(asTeacher(), TEACHER_EMAIL), { roleId: 'domain_admin' })
    );
    await assertFails(
      updateDoc(own(asDomainAdmin(), DOMAIN_ADMIN_EMAIL), { name: 'Paul' })
    );
    await assertFails(
      updateDoc(own(asSuper(), SUPER_EMAIL), { status: 'inactive' })
    );
    await assertFails(deleteDoc(own(asTeacher(), TEACHER_EMAIL)));
    await assertFails(
      updateDoc(
        doc(
          testEnv
            .authenticatedContext('teacher-uid', { email: TEACHER_EMAIL })
            .firestore(),
          `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`
        ),
        { lastActive: 'now' }
      )
    );
  });

  it('nobody reads or writes a removed-member tombstone', async () => {
    const path = `organizations/${ORG_ID}/removedMembers/gone@orono.k12.mn.us`;
    for (const [, db] of actors()) {
      await assertFails(setDoc(doc(db, path), { removedAt: 'now' }));
      await assertFails(deleteDoc(doc(db, path)));
      await assertFails(getDoc(doc(db, path)));
    }
  });

  it('an org member can read the saved Claude sign-in issuer and a non-member cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `organizations/${ORG_ID}`), {
        claudeManagedAuth: { enabled: true, issuer: 'https://x.example' },
      });
    });
    const snap = await assertSucceeds(
      getDoc(doc(asTeacher(), `organizations/${ORG_ID}`))
    );
    expect(snap.data()?.claudeManagedAuth).toEqual({
      enabled: true,
      issuer: 'https://x.example',
    });
    await assertFails(getDoc(doc(asOutsider(), `organizations/${ORG_ID}`)));
  });
});

describe('organizations/studentPageConfig — retired, no client access', () => {
  it('nobody reads or writes the retired student page config', async () => {
    for (const db of [asDomainAdmin(), asSuper(), asTeacher()]) {
      const ref = doc(db, `organizations/${ORG_ID}/studentPageConfig/default`);
      await assertFails(getDoc(ref));
      await assertFails(updateDoc(ref, { heroText: 'nope' }));
      await assertFails(deleteDoc(ref));
    }
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

describe('organizations/members — email case normalization (F15)', () => {
  // Every membership read keys off `request.auth.token.email.lower()`, which is
  // always lowercase. If a member doc were stored with a mixed-case email/id it
  // would be orphaned and the matching member would get permission-denied.
  // orgAdminV1 lowercases on write; this pins the read side.
  const validMember = (email: string) => ({
    email,
    orgId: ORG_ID,
    roleId: 'teacher',
    status: 'invited',
    buildingIds: ['high'],
  });

  // An auth context whose token email is mixed-case; `.lower()` in the rules
  // normalizes it to the lowercase member-doc id when reading.
  const asMixedCaseTeacher = () =>
    testEnv
      .authenticatedContext('mixedcase-uid', {
        email: 'New.Teacher@Orono.K12.MN.US',
        email_verified: true,
      })
      .firestore();

  it('a lowercase-stored member can self-read via a mixed-case auth email (lower() normalizes both sides)', async () => {
    // Seed the canonical lowercase member doc directly.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          'organizations/orono/members/new.teacher@orono.k12.mn.us'
        ),
        validMember('new.teacher@orono.k12.mn.us')
      );
    });

    // The self-read branch compares `request.auth.token.email.lower()` to the
    // (lowercase) doc id, so a mixed-case token email still resolves.
    await assertSucceeds(
      getDoc(
        doc(
          asMixedCaseTeacher(),
          `organizations/${ORG_ID}/members/new.teacher@orono.k12.mn.us`
        )
      )
    );
  });
});

describe('organizations/members — uid write restricted to Cloud Functions (Phase 4)', () => {
  // Phase 4 first-sign-in links a member's uid to their Google auth uid. This
  // MUST go through the `claimOrganizationInvite` callable — the Admin SDK
  // bypasses rules and can legally write `uid`. A client-writable path would
  // let any writer reassign a member's uid, hijacking the linked account.

  it('teacher cannot write uid on their own member doc', async () => {
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
