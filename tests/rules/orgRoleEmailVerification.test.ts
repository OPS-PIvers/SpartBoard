// Regression for the org-role hierarchy helpers — isSuperAdmin(),
// isDomainAdmin(), isBuildingAdmin(), isOrgMember() — plus the three inline
// identity checks in the same collections (members/{emailLower} self-probe
// read, members/{emailLower} lastActive self-write, admins/{email} self-read)
// that key off request.auth.token.email, a self-reported claim on this
// project's Auth (email/password sign-in is also supported). Before this fix
// none of these checked email_verified, so anyone who registered an
// unverified account using a REAL org member's address inherited that
// member's org-scoped access (up to and including super-admin org
// create/delete) without ever proving ownership of the address. Mirrors
// adminEmailVerification.test.ts's proof for the sibling isAdmin() fix
// (PR #2915).
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
import { setDoc, updateDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-org-role-email-verification';
const ORG_ID = 'orono';
const NEW_ORG_ID = 'brand-new-org';

const SUPER_EMAIL = 'real-super@orono.k12.mn.us';
const DOMAIN_ADMIN_EMAIL = 'real-domain-admin@orono.k12.mn.us';
const BUILDING_ADMIN_EMAIL = 'real-building-admin@orono.k12.mn.us';
const MEMBER_EMAIL = 'real-member@orono.k12.mn.us';
const SITE_ADMIN_EMAIL = 'real-site-admin@orono.k12.mn.us';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// Same uid space an attacker could occupy: any self-registered account can
// claim a real member's email as its token `email` — only `email_verified`
// is out of their control (Google Sign-In sets it; email/password does not).
const asUnverified = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: false })
    .firestore();
const asVerified = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: true })
    .firestore();
const asOmittedVerification = (uid: string, email: string) =>
  testEnv.authenticatedContext(uid, { email }).firestore();

const orgFields = (id: string) => ({
  id,
  name: 'New Org',
  shortName: 'New',
  shortCode: 'NEW',
  state: 'MN',
  plan: 'basic',
  aiEnabled: false,
  primaryAdminEmail: SUPER_EMAIL,
  createdAt: '2026-01-01',
  users: 0,
  buildings: 0,
  status: 'active',
  seedColor: 'bg-indigo-600',
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
    // Empty so the super-admin grant below only comes from isMemberSuperAdmin().
    await setDoc(doc(db, 'admin_settings/user_roles'), { superAdmins: [] });

    await setDoc(doc(db, `organizations/${ORG_ID}`), {
      id: ORG_ID,
      name: 'Orono',
      plan: 'full',
      aiEnabled: true,
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${SUPER_EMAIL}`), {
      email: SUPER_EMAIL,
      orgId: ORG_ID,
      roleId: 'super_admin',
      status: 'active',
      buildingIds: [],
    });
    await setDoc(
      doc(db, `organizations/${ORG_ID}/members/${DOMAIN_ADMIN_EMAIL}`),
      {
        email: DOMAIN_ADMIN_EMAIL,
        orgId: ORG_ID,
        roleId: 'domain_admin',
        status: 'active',
        buildingIds: ['high'],
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
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`), {
      email: MEMBER_EMAIL,
      orgId: ORG_ID,
      roleId: 'teacher',
      status: 'active',
      buildingIds: ['high'],
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/buildings/high`), {
      id: 'high',
      orgId: ORG_ID,
      name: 'Orono High',
    });
    // The real site admin's /admins doc, independent of who claims that email.
    await setDoc(doc(db, `admins/${SITE_ADMIN_EMAIL}`), { addedAt: 1 });
  });
});

describe('isSuperAdmin() (member-roleId source) requires a verified email claim', () => {
  it('denies an unverified caller self-reporting the real super admin email (org create)', async () => {
    await assertFails(
      setDoc(
        doc(
          asUnverified('impostor-uid', SUPER_EMAIL),
          `organizations/${NEW_ORG_ID}`
        ),
        orgFields(NEW_ORG_ID)
      )
    );
  });

  it('denies a caller with no email_verified claim at all (defaults unverified)', async () => {
    await assertFails(
      setDoc(
        doc(
          asOmittedVerification('impostor-uid-2', SUPER_EMAIL),
          `organizations/${NEW_ORG_ID}`
        ),
        orgFields(NEW_ORG_ID)
      )
    );
  });

  it('allows the real super admin once their token carries email_verified: true', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asVerified('real-super-uid', SUPER_EMAIL),
          `organizations/${NEW_ORG_ID}`
        ),
        orgFields(NEW_ORG_ID)
      )
    );
  });
});

describe('isDomainAdmin() requires a verified email claim', () => {
  it('denies an unverified caller self-reporting the real domain admin email (building create)', async () => {
    await assertFails(
      setDoc(
        doc(
          asUnverified('impostor-uid', DOMAIN_ADMIN_EMAIL),
          `organizations/${ORG_ID}/buildings/middle`
        ),
        { id: 'middle', orgId: ORG_ID, name: 'Orono Middle', users: 0 }
      )
    );
  });

  it('allows the real domain admin once their token carries email_verified: true', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asVerified('real-domain-admin-uid', DOMAIN_ADMIN_EMAIL),
          `organizations/${ORG_ID}/buildings/middle`
        ),
        { id: 'middle', orgId: ORG_ID, name: 'Orono Middle', users: 0 }
      )
    );
  });
});

describe('isBuildingAdmin() requires a verified email claim', () => {
  it('denies an unverified caller self-reporting the real building admin email (building update)', async () => {
    await assertFails(
      updateDoc(
        doc(
          asUnverified('impostor-uid', BUILDING_ADMIN_EMAIL),
          `organizations/${ORG_ID}/buildings/high`
        ),
        { name: 'Hijacked High' }
      )
    );
  });

  it('allows the real building admin once their token carries email_verified: true', async () => {
    await assertSucceeds(
      updateDoc(
        doc(
          asVerified('real-building-admin-uid', BUILDING_ADMIN_EMAIL),
          `organizations/${ORG_ID}/buildings/high`
        ),
        { name: 'Renamed High' }
      )
    );
  });
});

describe('isOrgMember() requires a verified email claim', () => {
  it('denies an unverified caller self-reporting a real member email (org doc read)', async () => {
    await assertFails(
      getDoc(
        doc(
          asUnverified('impostor-uid', MEMBER_EMAIL),
          `organizations/${ORG_ID}`
        )
      )
    );
  });

  it('denies a caller with no email_verified claim at all (defaults unverified)', async () => {
    await assertFails(
      getDoc(
        doc(
          asOmittedVerification('impostor-uid-2', MEMBER_EMAIL),
          `organizations/${ORG_ID}`
        )
      )
    );
  });

  it('allows the real member once their token carries email_verified: true', async () => {
    await assertSucceeds(
      getDoc(
        doc(
          asVerified('real-member-uid', MEMBER_EMAIL),
          `organizations/${ORG_ID}`
        )
      )
    );
  });
});

describe('organizations/{orgId}/members/{emailLower} self-probe read requires a verified email claim', () => {
  it('denies an unverified caller self-reporting a real member email (reads that member doc: roleId, buildingIds, status)', async () => {
    await assertFails(
      getDoc(
        doc(
          asUnverified('impostor-uid', MEMBER_EMAIL),
          `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`
        )
      )
    );
  });

  it('allows the real member to read their own member doc once verified', async () => {
    await assertSucceeds(
      getDoc(
        doc(
          asVerified('real-member-uid', MEMBER_EMAIL),
          `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`
        )
      )
    );
  });
});

describe('organizations/{orgId}/members/{emailLower} lastActive self-write requires a verified email claim', () => {
  it('denies an unverified caller self-reporting a real member email from stamping lastActive', async () => {
    await assertFails(
      updateDoc(
        doc(
          asUnverified('impostor-uid', MEMBER_EMAIL),
          `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`
        ),
        { lastActive: 12345 }
      )
    );
  });

  it('allows the real member to stamp lastActive on their own doc once verified', async () => {
    await assertSucceeds(
      updateDoc(
        doc(
          asVerified('real-member-uid', MEMBER_EMAIL),
          `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`
        ),
        { lastActive: 12345 }
      )
    );
  });
});

describe('admins/{email} self-read requires a verified email claim', () => {
  it('denies an unverified caller self-reporting the real site admin email', async () => {
    await assertFails(
      getDoc(
        doc(
          asUnverified('impostor-uid', SITE_ADMIN_EMAIL),
          `admins/${SITE_ADMIN_EMAIL}`
        )
      )
    );
  });

  it('allows the real site admin to read their own admin doc once verified', async () => {
    await assertSucceeds(
      getDoc(
        doc(
          asVerified('real-site-admin-uid', SITE_ADMIN_EMAIL),
          `admins/${SITE_ADMIN_EMAIL}`
        )
      )
    );
  });
});
