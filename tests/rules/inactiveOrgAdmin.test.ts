// Firestore security-rules tests: a deactivated (status 'inactive') domain or
// building admin loses the org-admin tier, and no non-super admin can change
// their own member roleId or status (so a deactivation can't be self-reversed).
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
import { setDoc, getDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-inactive-org-admin';
const ORG_ID = 'acme-district';

const DOMAIN_EMAIL = 'domain.admin@acme.edu';
const INACTIVE_DOMAIN_EMAIL = 'gone.domain@acme.edu';
const BUILDING_EMAIL = 'building.admin@acme.edu';
const INACTIVE_BUILDING_EMAIL = 'gone.building@acme.edu';
const TEACHER_EMAIL = 'teacher@acme.edu';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const as = (email: string) =>
  testEnv
    .authenticatedContext(`uid-${email}`, {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const memberPath = (email: string) =>
  `organizations/${ORG_ID}/members/${email}`;
const analyticsPath = `organizations/${ORG_ID}/analytics/snapshot`;

const member = (email: string, roleId: string, status: string) => ({
  email,
  orgId: ORG_ID,
  roleId,
  buildingIds: ['high'],
  status,
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
    await setDoc(doc(db, `organizations/${ORG_ID}`), { id: ORG_ID });
    await setDoc(
      doc(db, memberPath(DOMAIN_EMAIL)),
      member(DOMAIN_EMAIL, 'domain_admin', 'active')
    );
    await setDoc(
      doc(db, memberPath(INACTIVE_DOMAIN_EMAIL)),
      member(INACTIVE_DOMAIN_EMAIL, 'domain_admin', 'inactive')
    );
    await setDoc(
      doc(db, memberPath(BUILDING_EMAIL)),
      member(BUILDING_EMAIL, 'building_admin', 'active')
    );
    await setDoc(
      doc(db, memberPath(INACTIVE_BUILDING_EMAIL)),
      member(INACTIVE_BUILDING_EMAIL, 'building_admin', 'inactive')
    );
    await setDoc(
      doc(db, memberPath(TEACHER_EMAIL)),
      member(TEACHER_EMAIL, 'teacher', 'active')
    );
    await setDoc(doc(db, analyticsPath), { members: [] });
  });
});

describe('deactivated org admins lose the admin tier', () => {
  it('active domain and building admins can read analytics', async () => {
    await assertSucceeds(getDoc(doc(as(DOMAIN_EMAIL), analyticsPath)));
    await assertSucceeds(getDoc(doc(as(BUILDING_EMAIL), analyticsPath)));
  });

  it('inactive domain admin is DENIED reading analytics', async () => {
    await assertFails(getDoc(doc(as(INACTIVE_DOMAIN_EMAIL), analyticsPath)));
  });

  it('inactive building admin is DENIED reading analytics', async () => {
    await assertFails(getDoc(doc(as(INACTIVE_BUILDING_EMAIL), analyticsPath)));
  });

  it('inactive domain admin is DENIED updating another member', async () => {
    await assertFails(
      updateDoc(doc(as(INACTIVE_DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'inactive',
      })
    );
  });

  it('inactive building admin is DENIED flipping another member status', async () => {
    await assertFails(
      updateDoc(doc(as(INACTIVE_BUILDING_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'inactive',
      })
    );
  });
});

describe('no self-reactivation or self role change', () => {
  it('inactive domain admin is DENIED writing status active to own doc', async () => {
    await assertFails(
      updateDoc(
        doc(as(INACTIVE_DOMAIN_EMAIL), memberPath(INACTIVE_DOMAIN_EMAIL)),
        { status: 'active' }
      )
    );
  });

  it('inactive building admin is DENIED writing status active to own doc', async () => {
    await assertFails(
      updateDoc(
        doc(as(INACTIVE_BUILDING_EMAIL), memberPath(INACTIVE_BUILDING_EMAIL)),
        { status: 'active' }
      )
    );
  });

  it('active domain admin is DENIED changing own status or roleId', async () => {
    await assertFails(
      updateDoc(doc(as(DOMAIN_EMAIL), memberPath(DOMAIN_EMAIL)), {
        status: 'inactive',
      })
    );
    await assertFails(
      updateDoc(doc(as(DOMAIN_EMAIL), memberPath(DOMAIN_EMAIL)), {
        roleId: 'teacher',
      })
    );
  });

  it('active domain admin can still edit own name and lastActive', async () => {
    await assertSucceeds(
      updateDoc(doc(as(DOMAIN_EMAIL), memberPath(DOMAIN_EMAIL)), {
        name: 'New Name',
      })
    );
    await assertSucceeds(
      updateDoc(doc(as(DOMAIN_EMAIL), memberPath(DOMAIN_EMAIL)), {
        lastActive: '2026-10-25T00:00:00.000Z',
      })
    );
  });

  it('active building admin is DENIED flipping own status', async () => {
    await assertFails(
      updateDoc(doc(as(BUILDING_EMAIL), memberPath(BUILDING_EMAIL)), {
        status: 'inactive',
      })
    );
  });

  it('active admins can still deactivate another member', async () => {
    await assertSucceeds(
      updateDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'inactive',
      })
    );
    await assertSucceeds(
      updateDoc(doc(as(BUILDING_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'active',
      })
    );
  });
});
