// Firestore security-rules regression for the Help Center collections:
//   - `/help_center/config` — authed read, super-admin-only write
//   - `/help_resources/{itemId}` — admin writes scoped by org (orgId == null is
//     global and super-admin-only), reads limited to email-bearing teachers on
//     global or own-org items, and a teacher-only openCount increment of +1
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
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-help-center';
const ORG_A = 'orono';
const ORG_B = 'other-district';

const SUPER_UID = 'super-admin-uid';
const SUPER_EMAIL = 'super@example.com';
const ORG_ADMIN_UID = 'org-admin-uid';
const ORG_ADMIN_EMAIL = 'org-admin@example.com';
const TEACHER_UID = 'teacher-uid';
const TEACHER_EMAIL = 'teacher@example.com';
const TEACHER_B_UID = 'teacher-b-uid';
const TEACHER_B_EMAIL = 'teacher-b@example.com';
const ANON_STUDENT_UID = 'anon-pin-student-uid';
const GIS_STUDENT_UID = 'gis-student-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asSuper = () =>
  testEnv.authenticatedContext(SUPER_UID, { email: SUPER_EMAIL }).firestore();
const asOrgAdmin = () =>
  testEnv
    .authenticatedContext(ORG_ADMIN_UID, { email: ORG_ADMIN_EMAIL })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, { email: TEACHER_EMAIL })
    .firestore();
const asTeacherB = () =>
  testEnv
    .authenticatedContext(TEACHER_B_UID, { email: TEACHER_B_EMAIL })
    .firestore();
// Anon PIN and GIS students authenticate without an email claim.
const asAnonStudent = () =>
  testEnv.authenticatedContext(ANON_STUDENT_UID).firestore();
const asGisStudent = () =>
  testEnv
    .authenticatedContext(GIS_STUDENT_UID, {
      studentRole: true,
      orgId: ORG_A,
      classIds: ['class-1'],
    })
    .firestore();

const validItem = (
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  id,
  kind: 'embed',
  title: 'How to build a board',
  description: 'A short walkthrough.',
  categoryId: 'getting-started',
  order: 0,
  visible: true,
  orgId: null,
  widgetTypes: [],
  url: 'https://docs.google.com/document/d/abc/edit',
  embedType: 'doc',
  setId: null,
  openCount: 0,
  createdBy: SUPER_UID,
  createdByEmail: SUPER_EMAIL,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
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
    // isAdmin() reads /admins/{email}; isSuperAdmin() reads the legacy list.
    await setDoc(doc(db, `admins/${SUPER_EMAIL}`), { addedAt: 1 });
    await setDoc(doc(db, `admins/${ORG_ADMIN_EMAIL}`), { addedAt: 1 });
    await setDoc(doc(db, 'admin_settings/user_roles'), {
      superAdmins: [SUPER_EMAIL],
    });
    await setDoc(doc(db, `organizations/${ORG_A}/members/${SUPER_EMAIL}`), {
      roleId: 'super_admin',
    });
    await setDoc(doc(db, `organizations/${ORG_A}/members/${ORG_ADMIN_EMAIL}`), {
      roleId: 'admin',
    });
    await setDoc(doc(db, `organizations/${ORG_A}/members/${TEACHER_EMAIL}`), {
      roleId: 'teacher',
    });
    await setDoc(doc(db, `organizations/${ORG_B}/members/${TEACHER_B_EMAIL}`), {
      roleId: 'teacher',
    });
  });
});

describe('help_center/config', () => {
  it('any authenticated user can read the category config', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'help_center/config'), {
        categories: [],
        updatedAt: 1,
        updatedBy: SUPER_UID,
      });
    });
    await assertSucceeds(getDoc(doc(asTeacher(), 'help_center/config')));
  });

  it('a super admin can write the config', async () => {
    await assertSucceeds(
      setDoc(doc(asSuper(), 'help_center/config'), {
        categories: [
          { id: 'getting-started', name: 'Getting started', order: 0 },
        ],
        updatedAt: 1000,
        updatedBy: SUPER_UID,
      })
    );
  });

  it('a non-super admin cannot write the config', async () => {
    await assertFails(
      setDoc(doc(asOrgAdmin(), 'help_center/config'), {
        categories: [],
        updatedAt: 1000,
        updatedBy: ORG_ADMIN_UID,
      })
    );
  });

  it('updatedBy must be the caller uid', async () => {
    await assertFails(
      setDoc(doc(asSuper(), 'help_center/config'), {
        categories: [],
        updatedAt: 1000,
        updatedBy: ORG_ADMIN_UID,
      })
    );
  });
});

describe('help_resources — create', () => {
  it('a super admin can create a global item (orgId null)', async () => {
    await assertSucceeds(
      setDoc(doc(asSuper(), 'help_resources/global-1'), validItem('global-1'))
    );
  });

  it('an org admin cannot create a global item', async () => {
    await assertFails(
      setDoc(
        doc(asOrgAdmin(), 'help_resources/global-2'),
        validItem('global-2', {
          createdBy: ORG_ADMIN_UID,
          createdByEmail: ORG_ADMIN_EMAIL,
        })
      )
    );
  });

  it('an org admin can create an item scoped to their own org', async () => {
    await assertSucceeds(
      setDoc(
        doc(asOrgAdmin(), 'help_resources/org-1'),
        validItem('org-1', {
          orgId: ORG_A,
          createdBy: ORG_ADMIN_UID,
          createdByEmail: ORG_ADMIN_EMAIL,
        })
      )
    );
  });

  it('an org admin cannot create an item scoped to another org', async () => {
    await assertFails(
      setDoc(
        doc(asOrgAdmin(), 'help_resources/org-2'),
        validItem('org-2', {
          orgId: ORG_B,
          createdBy: ORG_ADMIN_UID,
          createdByEmail: ORG_ADMIN_EMAIL,
        })
      )
    );
  });

  it('a plain teacher cannot create items', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), 'help_resources/teacher-1'),
        validItem('teacher-1', {
          orgId: ORG_A,
          createdBy: TEACHER_UID,
          createdByEmail: TEACHER_EMAIL,
        })
      )
    );
  });

  it('an http url is rejected', async () => {
    await assertFails(
      setDoc(
        doc(asSuper(), 'help_resources/http-1'),
        validItem('http-1', { url: 'http://example.com/guide' })
      )
    );
  });

  it('a guided-learning item carrying a url is rejected', async () => {
    await assertFails(
      setDoc(
        doc(asSuper(), 'help_resources/gl-bad'),
        validItem('gl-bad', {
          kind: 'guided-learning',
          setId: 'set-1',
          embedType: null,
        })
      )
    );
  });

  it('a well-formed guided-learning item is accepted', async () => {
    await assertSucceeds(
      setDoc(
        doc(asSuper(), 'help_resources/gl-ok'),
        validItem('gl-ok', {
          kind: 'guided-learning',
          setId: 'set-1',
          url: null,
          embedType: null,
        })
      )
    );
  });

  it('openCount must start at 0', async () => {
    await assertFails(
      setDoc(
        doc(asSuper(), 'help_resources/count-1'),
        validItem('count-1', { openCount: 5 })
      )
    );
  });

  it('unexpected fields are rejected by the schema lock-down', async () => {
    await assertFails(
      setDoc(
        doc(asSuper(), 'help_resources/stow-1'),
        validItem('stow-1', { stowaway: 'evil' })
      )
    );
  });
});

describe('help_resources — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'help_resources/global-1'), validItem('global-1'));
      await setDoc(
        doc(db, 'help_resources/org-a-1'),
        validItem('org-a-1', { orgId: ORG_A })
      );
      await setDoc(
        doc(db, 'help_resources/org-b-1'),
        validItem('org-b-1', { orgId: ORG_B })
      );
    });
  });

  it('a teacher reads global items', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), 'help_resources/global-1')));
  });

  it('a teacher reads items scoped to their own org', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), 'help_resources/org-a-1')));
  });

  it("a teacher cannot read another org's items", async () => {
    await assertFails(getDoc(doc(asTeacher(), 'help_resources/org-b-1')));
  });

  it('an anonymous PIN student cannot read a global item', async () => {
    await assertFails(getDoc(doc(asAnonStudent(), 'help_resources/global-1')));
  });

  it('a GIS student cannot read an item scoped to their own org', async () => {
    await assertFails(getDoc(doc(asGisStudent(), 'help_resources/org-a-1')));
  });
});

describe('help_resources — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, 'help_resources/org-a-1'),
        validItem('org-a-1', {
          orgId: ORG_A,
          createdBy: ORG_ADMIN_UID,
          createdByEmail: ORG_ADMIN_EMAIL,
        })
      );
    });
  });

  it('an org admin can edit an item in their own org', async () => {
    await assertSucceeds(
      updateDoc(doc(asOrgAdmin(), 'help_resources/org-a-1'), {
        title: 'Renamed guide',
        updatedAt: 2000,
      })
    );
  });

  it('an admin cannot change orgId', async () => {
    await assertFails(
      updateDoc(doc(asOrgAdmin(), 'help_resources/org-a-1'), {
        orgId: ORG_B,
        updatedAt: 2000,
      })
    );
  });

  it('an admin cannot change openCount', async () => {
    await assertFails(
      updateDoc(doc(asOrgAdmin(), 'help_resources/org-a-1'), {
        openCount: 42,
        updatedAt: 2000,
      })
    );
  });

  it('a teacher can increment openCount by exactly 1', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), 'help_resources/org-a-1'), { openCount: 1 })
    );
  });

  it('a teacher in another org cannot increment openCount on an org-scoped item', async () => {
    await assertFails(
      updateDoc(doc(asTeacherB(), 'help_resources/org-a-1'), { openCount: 1 })
    );
  });

  it('any authed teacher can increment openCount on a global item', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'help_resources/global-1'),
        validItem('global-1')
      );
    });
    await assertSucceeds(
      updateDoc(doc(asTeacherB(), 'help_resources/global-1'), { openCount: 1 })
    );
  });

  it('a teacher cannot increment openCount by 2', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), 'help_resources/org-a-1'), { openCount: 2 })
    );
  });

  it('an anonymous PIN student cannot inflate openCount on a global item', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'help_resources/global-1'),
        validItem('global-1')
      );
    });
    await assertFails(
      updateDoc(doc(asAnonStudent(), 'help_resources/global-1'), {
        openCount: 1,
      })
    );
  });

  it('a GIS student cannot inflate openCount on their own org item', async () => {
    await assertFails(
      updateDoc(doc(asGisStudent(), 'help_resources/org-a-1'), { openCount: 1 })
    );
  });

  it('a teacher cannot change the title alongside openCount', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), 'help_resources/org-a-1'), {
        openCount: 1,
        title: 'Teacher rewrite',
      })
    );
  });
});

describe('help_resources — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'help_resources/global-1'), validItem('global-1'));
      await setDoc(
        doc(db, 'help_resources/org-a-1'),
        validItem('org-a-1', { orgId: ORG_A })
      );
    });
  });

  it('an org admin can delete an item in their own org', async () => {
    await assertSucceeds(
      deleteDoc(doc(asOrgAdmin(), 'help_resources/org-a-1'))
    );
  });

  it('an org admin cannot delete a global item', async () => {
    await assertFails(deleteDoc(doc(asOrgAdmin(), 'help_resources/global-1')));
  });

  it('a teacher cannot delete items', async () => {
    await assertFails(deleteDoc(doc(asTeacher(), 'help_resources/org-a-1')));
  });
});
