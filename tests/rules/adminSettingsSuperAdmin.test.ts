// Security-bearing admin_settings docs (user_roles defines super admins; view_as,
// lti_config and sub_launch_as_teacher gate server powers) are super-admin-only
// writes (classlink_sync too: it switches on a destructive roster job). An org-scoped building/domain admin mirrored into /admins must not be
// able to list themselves in superAdmins[] or flip those switches.
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
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-admin-settings-super-admin-rules-test';
const BUILDING_ADMIN_EMAIL = 'principal@school.edu';
const DOMAIN_ADMIN_EMAIL = 'district@school.edu';
const MEMBER_SUPER_EMAIL = 'boss@school.edu';
const LEGACY_SUPER_EMAIL = 'legacy@school.edu';
const TEACHER_EMAIL = 'teacher@school.edu';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const PROTECTED_DOCS = [
  'admin_settings/user_roles',
  'admin_settings/view_as',
  'admin_settings/lti_config',
  'admin_settings/sub_launch_as_teacher',
  'admin_settings/classlink_sync',
];

let testEnv: RulesTestEnvironment;

const as = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asBuildingAdmin = () => as('building-admin-uid', BUILDING_ADMIN_EMAIL);
const asDomainAdmin = () => as('domain-admin-uid', DOMAIN_ADMIN_EMAIL);
const asMemberSuper = () => as('member-super-uid', MEMBER_SUPER_EMAIL);
const asLegacySuper = () => as('legacy-super-uid', LEGACY_SUPER_EMAIL);
const asTeacher = () => as('teacher-uid', TEACHER_EMAIL);

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
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
    await setDoc(doc(db, `admins/${BUILDING_ADMIN_EMAIL}`), {
      roleId: 'building_admin',
    });
    await setDoc(doc(db, `admins/${DOMAIN_ADMIN_EMAIL}`), {
      roleId: 'domain_admin',
    });
    await setDoc(doc(db, `admins/${MEMBER_SUPER_EMAIL}`), {
      roleId: 'super_admin',
    });
    await setDoc(doc(db, `organizations/orono/members/${MEMBER_SUPER_EMAIL}`), {
      roleId: 'super_admin',
      status: 'active',
    });
    await setDoc(doc(db, `admins/${LEGACY_SUPER_EMAIL}`), {});
    await setDoc(doc(db, 'admin_settings/user_roles'), {
      superAdmins: [LEGACY_SUPER_EMAIL],
    });
  });
});

describe('admin_settings/user_roles', () => {
  it('denies a building admin adding themselves to superAdmins', async () => {
    const db = asBuildingAdmin();
    await assertFails(
      setDoc(doc(db, 'admin_settings/user_roles'), {
        superAdmins: [BUILDING_ADMIN_EMAIL],
      })
    );
    await assertFails(
      setDoc(
        doc(db, 'admin_settings/user_roles'),
        { superAdmins: [LEGACY_SUPER_EMAIL, BUILDING_ADMIN_EMAIL] },
        { merge: true }
      )
    );
    await assertFails(deleteDoc(doc(db, 'admin_settings/user_roles')));
  });

  it('denies a domain admin adding themselves to superAdmins', async () => {
    await assertFails(
      setDoc(doc(asDomainAdmin(), 'admin_settings/user_roles'), {
        superAdmins: [DOMAIN_ADMIN_EMAIL],
      })
    );
  });

  it('still lets an admin read it', async () => {
    await assertSucceeds(
      getDoc(doc(asBuildingAdmin(), 'admin_settings/user_roles'))
    );
  });

  it('lets a super admin from either source write it', async () => {
    await assertSucceeds(
      setDoc(doc(asMemberSuper(), 'admin_settings/user_roles'), {
        superAdmins: [LEGACY_SUPER_EMAIL],
      })
    );
    await assertSucceeds(
      setDoc(doc(asLegacySuper(), 'admin_settings/user_roles'), {
        superAdmins: [LEGACY_SUPER_EMAIL],
      })
    );
  });
});

describe('other security-bearing settings docs', () => {
  for (const path of PROTECTED_DOCS) {
    it(`${path}: org admins cannot write, a super admin can`, async () => {
      await assertFails(
        setDoc(doc(asBuildingAdmin(), path), { enabled: true })
      );
      await assertFails(setDoc(doc(asDomainAdmin(), path), { enabled: true }));
      await assertSucceeds(
        setDoc(doc(asMemberSuper(), path), { enabled: true }, { merge: true })
      );
    });
  }

  it('denies org admins writing a subcollection under a protected doc', async () => {
    await assertFails(
      setDoc(doc(asBuildingAdmin(), 'admin_settings/view_as/x/y'), { a: 1 })
    );
  });

  it('leaves ordinary settings docs writable by any admin', async () => {
    await assertSucceeds(
      setDoc(doc(asBuildingAdmin(), 'admin_settings/app_settings'), { a: 1 })
    );
  });
});

describe('reads after the match split', () => {
  it('lets any admin read every protected doc and a subcollection under one', async () => {
    for (const path of [...PROTECTED_DOCS, 'admin_settings/view_as/x/y']) {
      await assertSucceeds(getDoc(doc(asBuildingAdmin(), path)));
      await assertSucceeds(getDoc(doc(asDomainAdmin(), path)));
    }
  });

  it('keeps admin-only settings unreadable by a teacher', async () => {
    for (const path of [
      'admin_settings/user_roles',
      'admin_settings/view_as',
      'admin_settings/lti_config',
      'admin_settings/classlink_sync',
      'admin_settings/app_settings',
    ]) {
      await assertFails(getDoc(doc(asTeacher(), path)));
    }
  });

  it('still lets a teacher read the substitute launch switch', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacher(), 'admin_settings/sub_launch_as_teacher'))
    );
  });
});
