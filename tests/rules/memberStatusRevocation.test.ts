// Firestore security-rules tests: a super admin's operator-org member doc must be
// active to grant the tier, member status accepts only active|invited|inactive, any
// other stored status revokes access, and a building admin cannot reactivate anyone.
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
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-member-status-revocation';
const OPERATOR = 'orono';
const OTHER_ORG = 'acme-district';

const SUPER_EMAIL = 'boss@orono.k12.mn.us';
const DOMAIN_EMAIL = 'district@orono.k12.mn.us';
const BUILDING_EMAIL = 'principal@orono.k12.mn.us';
const TEACHER_EMAIL = 'teacher@orono.k12.mn.us';
const OTHER_MEMBER_EMAIL = 'someone@acme.edu';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const uidFor = (email: string) => `uid-${email}`;
const as = (email: string) =>
  testEnv
    .authenticatedContext(uidFor(email), {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const memberPath = (email: string, orgId = OPERATOR) =>
  `organizations/${orgId}/members/${email}`;
const dashboardPath = (email: string) =>
  `users/${uidFor(email)}/dashboards/board-1`;
const member = (
  email: string,
  roleId: string,
  status: string | undefined,
  orgId = OPERATOR
) => ({
  email,
  orgId,
  roleId,
  buildingIds: ['high'],
  ...(status === undefined ? {} : { status }),
});

const seed = async (path: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
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
  await seed(`organizations/${OTHER_ORG}`, { id: OTHER_ORG });
  await seed(
    memberPath(OTHER_MEMBER_EMAIL, OTHER_ORG),
    member(OTHER_MEMBER_EMAIL, 'teacher', 'active', OTHER_ORG)
  );
  await seed('admin_settings/user_roles', { superAdmins: [] });
  await seed(
    memberPath(SUPER_EMAIL),
    member(SUPER_EMAIL, 'super_admin', 'active')
  );
  await seed(
    memberPath(DOMAIN_EMAIL),
    member(DOMAIN_EMAIL, 'domain_admin', 'active')
  );
  await seed(
    memberPath(BUILDING_EMAIL),
    member(BUILDING_EMAIL, 'building_admin', 'active')
  );
  await seed(
    memberPath(TEACHER_EMAIL),
    member(TEACHER_EMAIL, 'teacher', 'active')
  );
});

describe('super admin tier requires an active member doc', () => {
  for (const status of ['active', undefined]) {
    it(`status ${String(status)}: reads another org and writes user_roles`, async () => {
      await seed(
        memberPath(SUPER_EMAIL),
        member(SUPER_EMAIL, 'super_admin', status)
      );
      await assertSucceeds(
        getDoc(doc(as(SUPER_EMAIL), memberPath(OTHER_MEMBER_EMAIL, OTHER_ORG)))
      );
      await assertSucceeds(
        setDoc(doc(as(SUPER_EMAIL), 'admin_settings/user_roles'), {
          superAdmins: [],
        })
      );
    });
  }

  for (const status of ['inactive', 'invited', 'removed', 'foo']) {
    it(`status ${status}: DENIED reading another org and writing user_roles`, async () => {
      await seed(
        memberPath(SUPER_EMAIL),
        member(SUPER_EMAIL, 'super_admin', status)
      );
      await assertFails(
        getDoc(doc(as(SUPER_EMAIL), memberPath(OTHER_MEMBER_EMAIL, OTHER_ORG)))
      );
      await assertFails(
        setDoc(doc(as(SUPER_EMAIL), 'admin_settings/user_roles'), {
          superAdmins: [SUPER_EMAIL],
        })
      );
      await assertFails(
        updateDoc(doc(as(SUPER_EMAIL), memberPath(SUPER_EMAIL)), {
          status: 'active',
        })
      );
    });
  }

  it('a deactivated member on the legacy list is DENIED, including reactivating themselves', async () => {
    await seed(
      memberPath(SUPER_EMAIL),
      member(SUPER_EMAIL, 'super_admin', 'inactive')
    );
    await seed('admin_settings/user_roles', { superAdmins: [SUPER_EMAIL] });
    await assertFails(
      getDoc(doc(as(SUPER_EMAIL), memberPath(OTHER_MEMBER_EMAIL, OTHER_ORG)))
    );
    await assertFails(
      updateDoc(doc(as(SUPER_EMAIL), memberPath(SUPER_EMAIL)), {
        status: 'active',
      })
    );
  });

  it('the legacy list still grants an email with no orono member doc', async () => {
    const legacy = 'legacy.boss@orono.k12.mn.us';
    await seed('admin_settings/user_roles', { superAdmins: [legacy] });
    await assertSucceeds(
      getDoc(doc(as(legacy), memberPath(OTHER_MEMBER_EMAIL, OTHER_ORG)))
    );
  });
});

describe('lower admins cannot change the status of a legacy-list address', () => {
  beforeEach(async () => {
    await seed('admin_settings/user_roles', { superAdmins: [TEACHER_EMAIL] });
  });

  it('domain and building admins are DENIED deactivating it', async () => {
    await assertFails(
      updateDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'inactive',
      })
    );
    await assertFails(
      updateDoc(doc(as(BUILDING_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'inactive',
      })
    );
  });

  it('a domain admin may still edit its other fields', async () => {
    await assertSucceeds(
      updateDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)), {
        name: 'Renamed',
      })
    );
  });

  it('a domain admin is DENIED recreating it as inactive, but may recreate it live', async () => {
    const email = 'legacy.only@orono.k12.mn.us';
    await seed('admin_settings/user_roles', { superAdmins: [email] });
    await assertFails(
      setDoc(
        doc(as(DOMAIN_EMAIL), memberPath(email)),
        member(email, 'teacher', 'inactive')
      )
    );
    await assertSucceeds(
      setDoc(
        doc(as(DOMAIN_EMAIL), memberPath(email)),
        member(email, 'teacher', 'active')
      )
    );
    await assertSucceeds(getDoc(doc(as(DOMAIN_EMAIL), memberPath(email))));
  });

  it('a super admin may create it as inactive', async () => {
    const email = 'legacy.only@orono.k12.mn.us';
    await seed('admin_settings/user_roles', { superAdmins: [email] });
    await assertSucceeds(
      setDoc(
        doc(as(SUPER_EMAIL), memberPath(email)),
        member(email, 'teacher', 'inactive')
      )
    );
  });

  it('a super admin may deactivate it', async () => {
    await assertSucceeds(
      updateDoc(doc(as(SUPER_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'inactive',
      })
    );
  });

  it('a domain admin is DENIED deleting it while inactive, so the tier stays revoked', async () => {
    await seed(
      memberPath(TEACHER_EMAIL),
      member(TEACHER_EMAIL, 'teacher', 'inactive')
    );
    await assertFails(
      deleteDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)))
    );
    await assertFails(
      getDoc(doc(as(TEACHER_EMAIL), memberPath(OTHER_MEMBER_EMAIL, OTHER_ORG)))
    );
    await assertSucceeds(
      deleteDoc(doc(as(SUPER_EMAIL), memberPath(TEACHER_EMAIL)))
    );
  });

  it('a domain admin may still delete it while live', async () => {
    await assertSucceeds(
      deleteDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)))
    );
  });
});

describe('member status writes accept only active, invited, inactive', () => {
  for (const status of ['active', 'invited', 'inactive']) {
    it(`domain and super admins may write ${status}`, async () => {
      await assertSucceeds(
        updateDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)), { status })
      );
      await assertSucceeds(
        updateDoc(doc(as(SUPER_EMAIL), memberPath(TEACHER_EMAIL)), { status })
      );
    });
  }

  for (const status of ['removed', 'foo', '']) {
    it(`no admin may write "${status}"`, async () => {
      await assertFails(
        updateDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)), { status })
      );
      await assertFails(
        updateDoc(doc(as(SUPER_EMAIL), memberPath(TEACHER_EMAIL)), { status })
      );
      await assertFails(
        updateDoc(doc(as(BUILDING_EMAIL), memberPath(TEACHER_EMAIL)), {
          status,
        })
      );
    });

    it(`create refuses status "${status}"`, async () => {
      const email = 'new.person@orono.k12.mn.us';
      await assertFails(
        setDoc(
          doc(as(DOMAIN_EMAIL), memberPath(email)),
          member(email, 'teacher', status)
        )
      );
    });
  }

  it('create accepts invited', async () => {
    const email = 'new.person@orono.k12.mn.us';
    await assertSucceeds(
      setDoc(
        doc(as(DOMAIN_EMAIL), memberPath(email)),
        member(email, 'teacher', 'invited')
      )
    );
  });

  it('a member with no status field can still stamp lastActive', async () => {
    await seed(
      memberPath(TEACHER_EMAIL),
      member(TEACHER_EMAIL, 'teacher', undefined)
    );
    await assertSucceeds(
      updateDoc(doc(as(TEACHER_EMAIL), memberPath(TEACHER_EMAIL)), {
        lastActive: '2026-11-07T00:00:00.000Z',
      })
    );
  });
});

describe('any status other than active or invited revokes access', () => {
  for (const status of ['active', 'invited', undefined]) {
    it(`status ${String(status)}: reads and writes own dashboard`, async () => {
      await seed(
        memberPath(TEACHER_EMAIL),
        member(TEACHER_EMAIL, 'teacher', status)
      );
      await seed(dashboardPath(TEACHER_EMAIL), { name: 'Board' });
      await assertSucceeds(
        getDoc(doc(as(TEACHER_EMAIL), dashboardPath(TEACHER_EMAIL)))
      );
      await assertSucceeds(
        setDoc(doc(as(TEACHER_EMAIL), dashboardPath(TEACHER_EMAIL)), {
          name: 'B2',
        })
      );
    });
  }

  for (const status of ['inactive', 'removed', 'foo']) {
    it(`status ${status}: DENIED own dashboard reads and writes`, async () => {
      await seed(
        memberPath(TEACHER_EMAIL),
        member(TEACHER_EMAIL, 'teacher', status)
      );
      await seed(dashboardPath(TEACHER_EMAIL), { name: 'Board' });
      await assertFails(
        getDoc(doc(as(TEACHER_EMAIL), dashboardPath(TEACHER_EMAIL)))
      );
      await assertFails(
        setDoc(doc(as(TEACHER_EMAIL), dashboardPath(TEACHER_EMAIL)), {
          name: 'B2',
        })
      );
    });

    it(`status ${status}: domain admin loses the admin tier`, async () => {
      await seed(
        memberPath(DOMAIN_EMAIL),
        member(DOMAIN_EMAIL, 'domain_admin', status)
      );
      await assertFails(
        updateDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)), {
          status: 'inactive',
        })
      );
    });
  }
});

describe('building admins deactivate but never reactivate', () => {
  it('may deactivate a member in their building', async () => {
    await assertSucceeds(
      updateDoc(doc(as(BUILDING_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'inactive',
      })
    );
  });

  it('may activate an invited member in their building', async () => {
    await seed(
      memberPath(TEACHER_EMAIL),
      member(TEACHER_EMAIL, 'teacher', 'invited')
    );
    await assertSucceeds(
      updateDoc(doc(as(BUILDING_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'active',
      })
    );
  });

  for (const status of ['active', 'invited']) {
    it(`is DENIED moving an inactive member to ${status}`, async () => {
      await seed(
        memberPath(TEACHER_EMAIL),
        member(TEACHER_EMAIL, 'teacher', 'inactive')
      );
      await assertFails(
        updateDoc(doc(as(BUILDING_EMAIL), memberPath(TEACHER_EMAIL)), {
          status,
        })
      );
    });
  }

  it('may re-save an inactive member as inactive (bulk deactivate)', async () => {
    await seed(
      memberPath(TEACHER_EMAIL),
      member(TEACHER_EMAIL, 'teacher', 'inactive')
    );
    await assertSucceeds(
      updateDoc(doc(as(BUILDING_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'inactive',
      })
    );
  });

  it('a domain admin may reactivate', async () => {
    await seed(
      memberPath(TEACHER_EMAIL),
      member(TEACHER_EMAIL, 'teacher', 'inactive')
    );
    await assertSucceeds(
      updateDoc(doc(as(DOMAIN_EMAIL), memberPath(TEACHER_EMAIL)), {
        status: 'active',
      })
    );
  });
});
