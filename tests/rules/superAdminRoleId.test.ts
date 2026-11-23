// Firestore security-rules tests: `isSuperAdmin()` comes only from an
// operator-org member doc with roleId == 'super_admin'; the retired
// admin_settings/user_roles.superAdmins[] list grants nothing.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-superadmin-roleid';
const ORG_ID = 'orono';

const ROLE_SUPER_EMAIL = 'role.super@orono.k12.mn.us';
const TEACHER_EMAIL = 'plain.teacher@orono.k12.mn.us';
const LEGACY_EMAIL = 'legacy.only@orono.k12.mn.us';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// email_verified: true — a real member always has it via Google Sign-In;
// isSuperAdmin() now requires it (see firestore.rules).
const asRoleSuper = () =>
  testEnv
    .authenticatedContext('role-super-uid', {
      email: ROLE_SUPER_EMAIL,
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

const asLegacy = () =>
  testEnv
    .authenticatedContext('legacy-uid', {
      email: LEGACY_EMAIL,
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // A super_admin by member role, not on the legacy list.
    await setDoc(
      doc(db, `organizations/${ORG_ID}/members/${ROLE_SUPER_EMAIL}`),
      {
        email: ROLE_SUPER_EMAIL,
        orgId: ORG_ID,
        roleId: 'super_admin',
        buildingIds: [],
        status: 'active',
      }
    );
    // A plain teacher member — must NOT be treated as super admin.
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`), {
      email: TEACHER_EMAIL,
      orgId: ORG_ID,
      roleId: 'teacher',
      buildingIds: ['high'],
      status: 'active',
    });
    // The retired legacy list names someone with no member doc.
    await setDoc(doc(db, 'admin_settings/user_roles'), {
      superAdmins: [LEGACY_EMAIL],
    });
  });
});

describe('super admin via member roleId only', () => {
  const userRoles = { superAdmins: [] };

  it('member with roleId super_admin can write user_roles (super-admin-only)', async () => {
    await assertSucceeds(
      setDoc(doc(asRoleSuper(), 'admin_settings/user_roles'), userRoles)
    );
  });

  it('member with roleId super_admin can read any org', async () => {
    await assertSucceeds(getDoc(doc(asRoleSuper(), `organizations/${ORG_ID}`)));
  });

  it('plain teacher member is NOT granted super-admin access (user_roles write denied)', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), 'admin_settings/user_roles'), userRoles)
    );
  });

  it('an address only on the retired legacy list is NOT a super admin', async () => {
    await assertFails(
      setDoc(doc(asLegacy(), 'admin_settings/user_roles'), userRoles)
    );
    await assertFails(getDoc(doc(asLegacy(), `organizations/${ORG_ID}`)));
  });
});
