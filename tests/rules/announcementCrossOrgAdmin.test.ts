// Firestore rules regression coverage for a cross-org data leak on
// `announcements/{announcementId}` — same bug class already fixed in
// help_resources (#3181) and plcs/plcIndex (#3195).
//
// isAdmin() is a bare /admins/{email} doc, which also mirrors org-scoped
// building_admin (see functions/src/organizationMembersSync.ts: ADMIN_ROLES
// includes 'building_admin' alongside 'super_admin'/'domain_admin'). Used
// bare on the read rule's trailing disjunct, it let a building_admin of ANY
// org read (and, on the write rule, also create/update/delete) another
// org's org-scoped announcements. The fix swaps that bare isAdmin() for
// isSuperAdmin() (resource-independent, actually site-wide) on read, and
// scopes write to "that org's admin, or a real super admin (any org,
// including global/legacy docs)" via announcementWriteScopeOk() — a super
// admin's write access mirrors their read access, since the manager UI's
// edit/delete/toggle actions apply to whatever row the browse query
// returned with no separate org check of their own.
//
// This suite pins:
//   READ:
//     - a building_admin of a DIFFERENT org can NOT read an org-scoped
//       announcement (the leak — fails before the fix, passes after).
//     - a same-org admin CAN still read their own org's announcement
//       (already covered by isOrgMember(), unaffected by the fix).
//     - a real super admin CAN read a foreign org's announcement.
//     - legacy (missing orgId) and explicit orgId:null docs stay readable
//       by any authenticated user, admin or not.
//   WRITE (same bug shape on `allow write: if isAdmin();`, checked per the
//   task's pre-ship requirement before swapping the read rule alone):
//     - a building_admin of a DIFFERENT org can NOT create, update, or
//       delete another org's announcement.
//     - a same-org admin CAN still create/update/delete their own org's
//       announcement.
//     - a same-org admin can NOT re-home an announcement to another org's
//       orgId (or to global) through an update.
//     - only a real super admin can write a global/legacy (no orgId, or
//       orgId:null) announcement; a same-org (non-super) admin can NOT.
//     - a real super admin CAN also create/update/delete an org-scoped
//       announcement belonging to a DIFFERENT org (matches their read
//       access; a building_admin of that different org still can NOT).
//   UNFILTERED LIST QUERY (components/admin/Announcements/Widget.tsx's
//   AnnouncementsManager, which gates entry on plain isAdmin() and — before
//   this fix — ran collection(db,'announcements') with no where()):
//     - a real super admin CAN still run the unfiltered admin query.
//     - a same-org (non-super) admin can NOT run it (Firestore rejects the
//       whole query when no branch is resource-independent for them), but
//       CAN run the where('orgId','==', orgId)-filtered query the fixed
//       client now sends instead.
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
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
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-announcement-cross-org-admin';

const ORG_ID = 'org-orono';
const OTHER_ORG_ID = 'org-elsewhere';

const ORG_ANNOUNCEMENT_ID = 'announcement-org-stamped';
const OTHER_ORG_ANNOUNCEMENT_ID = 'announcement-other-org';
const LEGACY_ANNOUNCEMENT_ID = 'announcement-legacy';
const NULL_ORG_ANNOUNCEMENT_ID = 'announcement-null-org';

// Same-org site admin: an /admins doc + a member of ORG_ID (mirrors a
// building_admin promoted within their own org).
const ADMIN_UID = 'admin-uid';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';
// Out-of-org admin: an /admins doc, but a member of a DIFFERENT org (mirrors
// a building_admin of OTHER_ORG_ID — the exact leak shape).
const OTHER_ADMIN_UID = 'other-admin-uid';
const OTHER_ADMIN_EMAIL = 'admin@elsewhere.org';
// Plain same-org teacher: no /admins doc.
const TEACHER_UID = 'teacher-uid';
const TEACHER_EMAIL = 'teacher@orono.k12.mn.us';
// Site-wide super admin (legacy admin_settings/user_roles.superAdmins path).
const SUPER_ADMIN_UID = 'super-admin-uid';
const SUPER_ADMIN_EMAIL = 'super@orono.k12.mn.us';

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
const asOtherAdmin = () =>
  testEnv
    .authenticatedContext(OTHER_ADMIN_UID, {
      email: OTHER_ADMIN_EMAIL,
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

const orgAnnouncement = () => ({
  name: 'Org Announcement',
  orgId: ORG_ID,
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // /admins membership (isAdmin() checks /admins/{email.lower()}).
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(db, `admins/${OTHER_ADMIN_EMAIL}`), {});
    // Org membership (isOrgMember() checks /organizations/{org}/members/{email}) —
    // an admin role is itself a member doc in its own org, same as production
    // (functions/src/organizationMembersSync.ts mirrors the member doc's org).
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${ADMIN_EMAIL}`), {
      roleId: 'building_admin',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${TEACHER_EMAIL}`), {
      roleId: 'teacher',
    });
    await setDoc(
      doc(db, `organizations/${OTHER_ORG_ID}/members/${OTHER_ADMIN_EMAIL}`),
      { roleId: 'building_admin' }
    );
    // Legacy isSuperAdmin() path — site-wide, not org-scoped.
    await setDoc(doc(db, 'admin_settings/user_roles'), {
      superAdmins: [SUPER_ADMIN_EMAIL],
    });
    // A real super admin is also an /admins doc in production (a member-org
    // super_admin role is mirrored the same as building_admin — see
    // functions/src/organizationMembersSync.ts's ADMIN_ROLES); the writable
    // announcement rules require isAdmin() (any admin at all) in addition to
    // the fine-grained scoping, matching help_resources' isAdmin() +
    // helpScopeOk() idiom.
    await setDoc(doc(db, `admins/${SUPER_ADMIN_EMAIL}`), {});

    await setDoc(
      doc(db, `announcements/${ORG_ANNOUNCEMENT_ID}`),
      orgAnnouncement()
    );
    await setDoc(doc(db, `announcements/${OTHER_ORG_ANNOUNCEMENT_ID}`), {
      name: 'Other Org Announcement',
      orgId: OTHER_ORG_ID,
      isActive: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, `announcements/${LEGACY_ANNOUNCEMENT_ID}`), {
      name: 'Legacy Announcement',
      isActive: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, `announcements/${NULL_ORG_ANNOUNCEMENT_ID}`), {
      name: 'Explicit Null Org Announcement',
      orgId: null,
      isActive: true,
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

describe('announcements/{id} read — cross-org admin scoping (the leak)', () => {
  it('THE LEAK: a building_admin of a DIFFERENT org canNOT read an org-scoped announcement', async () => {
    await assertFails(
      getDoc(doc(asOtherAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`))
    );
  });

  it('a same-org admin CAN still read their own org announcement', async () => {
    await assertSucceeds(
      getDoc(doc(asAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`))
    );
  });

  it('a plain same-org teacher CAN still read their own org announcement', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacher(), `announcements/${ORG_ANNOUNCEMENT_ID}`))
    );
  });

  it('a real super admin CAN read a foreign org announcement', async () => {
    await assertSucceeds(
      getDoc(doc(asSuperAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`))
    );
  });

  it('legacy (no orgId) stays readable by any authenticated user', async () => {
    await assertSucceeds(
      getDoc(doc(asOtherAdmin(), `announcements/${LEGACY_ANNOUNCEMENT_ID}`))
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), `announcements/${LEGACY_ANNOUNCEMENT_ID}`))
    );
  });

  it('explicit orgId:null stays readable by any authenticated user', async () => {
    await assertSucceeds(
      getDoc(doc(asOtherAdmin(), `announcements/${NULL_ORG_ANNOUNCEMENT_ID}`))
    );
  });
});

describe('announcements/{id} write — cross-org admin scoping', () => {
  it('a building_admin of a DIFFERENT org canNOT update another org announcement', async () => {
    await assertFails(
      updateDoc(doc(asOtherAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`), {
        isActive: false,
        updatedAt: 2,
      })
    );
  });

  it('a building_admin of a DIFFERENT org canNOT delete another org announcement', async () => {
    await assertFails(
      deleteDoc(doc(asOtherAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`))
    );
  });

  it("a building_admin of a DIFFERENT org canNOT create an announcement stamped with someone else's org", async () => {
    await assertFails(
      setDoc(doc(asOtherAdmin(), `announcements/new-foreign-org`), {
        name: 'Forged',
        orgId: ORG_ID,
        isActive: false,
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('a same-org admin CAN update their own org announcement', async () => {
    await assertSucceeds(
      updateDoc(doc(asAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`), {
        isActive: false,
        updatedAt: 2,
      })
    );
  });

  it('a same-org admin CAN create an announcement stamped with their own org', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), `announcements/new-own-org`), {
        name: 'New',
        orgId: ORG_ID,
        isActive: false,
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('a same-org admin CAN delete their own org announcement', async () => {
    await assertSucceeds(
      deleteDoc(doc(asAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`))
    );
  });

  it('a same-org admin canNOT re-home their own org announcement to another org', async () => {
    await assertFails(
      updateDoc(doc(asAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`), {
        orgId: OTHER_ORG_ID,
        updatedAt: 2,
      })
    );
  });

  it('a same-org (non-super) admin canNOT write a legacy (no orgId) announcement', async () => {
    await assertFails(
      updateDoc(doc(asAdmin(), `announcements/${LEGACY_ANNOUNCEMENT_ID}`), {
        isActive: false,
        updatedAt: 2,
      })
    );
  });

  it('a same-org (non-super) admin canNOT create a global (orgId:null) announcement', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), `announcements/new-global`), {
        name: 'Global',
        orgId: null,
        isActive: false,
        createdAt: 1,
        updatedAt: 1,
      })
    );
  });

  it('a real super admin CAN write a legacy (no orgId) announcement', async () => {
    await assertSucceeds(
      updateDoc(
        doc(asSuperAdmin(), `announcements/${LEGACY_ANNOUNCEMENT_ID}`),
        { isActive: false, updatedAt: 2 }
      )
    );
  });

  it('a real super admin CAN update a foreign org-scoped announcement (matches their read access and the manager UI, which gates edit/delete on the unfiltered browse list with no org check)', async () => {
    await assertSucceeds(
      updateDoc(doc(asSuperAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`), {
        isActive: false,
        updatedAt: 2,
      })
    );
  });

  it('a real super admin CAN delete a foreign org-scoped announcement', async () => {
    await assertSucceeds(
      deleteDoc(doc(asSuperAdmin(), `announcements/${ORG_ANNOUNCEMENT_ID}`))
    );
  });

  it('a plain same-org teacher canNOT write any announcement (not an admin at all)', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), `announcements/${ORG_ANNOUNCEMENT_ID}`), {
        isActive: false,
        updatedAt: 2,
      })
    );
  });
});

describe('announcements — admin manager list query', () => {
  // A site-wide super admin needs a resource-independent read branch, or
  // Firestore rejects the unfiltered list query
  // components/admin/Announcements/Widget.tsx's AnnouncementsManager runs
  // for a super admin (collection(db,'announcements'), no where()).
  it('a site-wide super admin CAN run the unfiltered admin "browse all announcements" query', async () => {
    await assertSucceeds(getDocs(collection(asSuperAdmin(), 'announcements')));
  });

  // Intentional: documents a pre-existing Firestore quirk (the same one
  // announcementsQuery.test.ts pins for AnnouncementOverlay's old query) —
  // this collection's read rule has branches independent of the caller's
  // identity ("!('orgId' in resource.data)" and "orgId == null" — any authed
  // user can read a legacy/global doc), so an unfiltered list query is not
  // rejected outright the way it is for plcs (which has no such branch);
  // direct getDoc denial above is unaffected, but a raw unfiltered LIST
  // still leaks a foreign doc. This is why the real fix is in the CLIENT
  // (AnnouncementsManager), not just the rules: an org-scoped admin's query
  // must always be where('orgId','==', orgId).
  it("LEAK (documents the Firestore quirk the client fix works around): an org-scoped (non-super) admin's unfiltered query still returns a foreign-org doc", async () => {
    const snap = await assertSucceeds(
      getDocs(collection(asAdmin(), 'announcements'))
    );
    const ids = snap.docs.map((d) => d.id).sort();
    expect(ids).toContain(OTHER_ORG_ANNOUNCEMENT_ID);
  });

  // The actual production query the fixed client sends for a non-super admin
  // (where('orgId','==', orgId), not unfiltered) — this one Firestore CAN
  // enforce correctly, excluding the foreign-org doc.
  it("an org-scoped (non-super) admin's orgId-filtered query — what the fixed client actually sends — excludes the foreign-org doc", async () => {
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(asAdmin(), 'announcements'),
          where('orgId', '==', ORG_ID)
        )
      )
    );
    const ids = snap.docs.map((d) => d.id).sort();
    expect(ids).toEqual([ORG_ANNOUNCEMENT_ID]);
    expect(ids).not.toContain(OTHER_ORG_ANNOUNCEMENT_ID);
  });
});
