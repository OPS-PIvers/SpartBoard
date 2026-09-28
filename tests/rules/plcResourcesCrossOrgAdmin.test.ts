// Firestore rules regression coverage for a cross-org privilege escalation on
// `plc_resources/{resourceId}` — same bug class already fixed in
// help_resources (#3181), plcs/plcIndex (#3195) and announcements
// (announcementCrossOrgAdmin.test.ts).
//
// isAdmin() is a bare /admins/{email} doc, which also mirrors org-scoped
// building_admin/domain_admin (see functions/src/organizationMembersSync.ts:
// ADMIN_ROLES includes 'building_admin'/'domain_admin' alongside
// 'super_admin'). plc_resources has NO orgId field at all — a `scope: 'all'`
// doc fans out to literally every PLC in every organization
// (hooks/usePlcResources.ts's `where('scope','==','all')` query has no org
// filter), and the admin panel that writes this collection
// (components/admin/PlcResourcesManager) gates entry on plain `isAdmin`
// (components/admin/AdminSettings.tsx). Gating create/update/delete on bare
// isAdmin() therefore let a building_admin of ANY single org/building push
// (or delete another admin's) content visible to every PLC across every
// organization. The fix swaps that bare isAdmin() for isSuperAdmin()
// (resource-independent, actually site-wide) on create/update/delete.
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
import { setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-resources-cross-org-admin';
const RESOURCE_ID = 'r1';
const ORG_ID = 'org-orono';

// Building admin of some org: an /admins doc (mirrored by
// organizationMembersSync.ts) + a member doc with roleId 'building_admin'.
// This is the exact shape a single-building admin of ANY org has in
// production — NOT a site-wide super admin.
const BUILDING_ADMIN_UID = 'building-admin-uid';
const BUILDING_ADMIN_EMAIL = 'building-admin@orono.k12.mn.us';
// Plain teacher: no /admins doc at all.
const TEACHER_UID = 'teacher-uid';
const TEACHER_EMAIL = 'teacher@orono.k12.mn.us';
// Real site-wide super admin (legacy admin_settings/user_roles.superAdmins
// path) — also has a mirrored /admins doc, same as production.
const SUPER_ADMIN_UID = 'super-admin-uid';
const SUPER_ADMIN_EMAIL = 'super@orono.k12.mn.us';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asBuildingAdmin = () =>
  testEnv
    .authenticatedContext(BUILDING_ADMIN_UID, {
      email: BUILDING_ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: TEACHER_EMAIL,
      email_verified: true,
    })
    .firestore();
const asSuperAdmin = () =>
  testEnv
    .authenticatedContext(SUPER_ADMIN_UID, {
      email: SUPER_ADMIN_EMAIL,
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

const validResource = (overrides: Record<string, unknown> = {}) => ({
  id: RESOURCE_ID,
  kind: 'quiz',
  title: 'Shared Quiz Resource',
  description: 'An optional admin note',
  refId: 'quiz-ref-abc123',
  scope: 'all',
  plcIds: [],
  createdByAdminUid: BUILDING_ADMIN_UID,
  createdByAdminEmail: BUILDING_ADMIN_EMAIL,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // /admins membership (isAdmin() checks /admins/{email.lower()}) — mirrors
    // organizationMembersSync.ts, which creates this doc for building_admin,
    // domain_admin AND super_admin alike.
    await setDoc(doc(db, `admins/${BUILDING_ADMIN_EMAIL}`), {});
    await setDoc(doc(db, `admins/${SUPER_ADMIN_EMAIL}`), {});
    // Org membership: BUILDING_ADMIN is a building_admin of ORG_ID only.
    await setDoc(
      doc(db, `organizations/${ORG_ID}/members/${BUILDING_ADMIN_EMAIL}`),
      { roleId: 'building_admin' }
    );
    // Legacy isSuperAdmin() path — site-wide, not org-scoped.
    await setDoc(doc(db, 'admin_settings/user_roles'), {
      superAdmins: [SUPER_ADMIN_EMAIL],
    });
  });
});

describe('plc_resources create — cross-org admin escalation (the leak)', () => {
  it("THE LEAK: a building_admin (not a super admin) canNOT create a global (scope: all) plc_resource fanned out to every org's PLCs", async () => {
    await assertFails(
      setDoc(
        doc(asBuildingAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource()
      )
    );
  });

  it('a real super admin CAN still create a plc_resource', async () => {
    await assertSucceeds(
      setDoc(
        doc(asSuperAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({
          createdByAdminUid: SUPER_ADMIN_UID,
          createdByAdminEmail: SUPER_ADMIN_EMAIL,
        })
      )
    );
  });

  it('a plain teacher still canNOT create a plc_resource', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), `plc_resources/${RESOURCE_ID}`),
        validResource({
          createdByAdminUid: TEACHER_UID,
          createdByAdminEmail: TEACHER_EMAIL,
        })
      )
    );
  });
});

describe('plc_resources update/delete — cross-org admin escalation', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plc_resources/${RESOURCE_ID}`),
        validResource({
          createdByAdminUid: SUPER_ADMIN_UID,
          createdByAdminEmail: SUPER_ADMIN_EMAIL,
        })
      );
    });
  });

  it('THE LEAK: a building_admin canNOT update a global plc_resource created by a real super admin', async () => {
    await assertFails(
      updateDoc(doc(asBuildingAdmin(), `plc_resources/${RESOURCE_ID}`), {
        title: 'Hijacked',
        updatedAt: 2000,
      })
    );
  });

  it('THE LEAK: a building_admin canNOT delete a global plc_resource that reaches every org', async () => {
    await assertFails(
      deleteDoc(doc(asBuildingAdmin(), `plc_resources/${RESOURCE_ID}`))
    );
  });

  it('a real super admin CAN update a plc_resource', async () => {
    await assertSucceeds(
      updateDoc(doc(asSuperAdmin(), `plc_resources/${RESOURCE_ID}`), {
        title: 'Updated by a real super admin',
        updatedAt: 2000,
      })
    );
  });

  it('a real super admin CAN delete a plc_resource', async () => {
    await assertSucceeds(
      deleteDoc(doc(asSuperAdmin(), `plc_resources/${RESOURCE_ID}`))
    );
  });
});
