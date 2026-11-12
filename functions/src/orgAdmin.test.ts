// Unit tests for orgAdminV1: each planner mirrors its firestore.rules gate, and the runner writes only what passed.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});

import type * as admin from './firebaseAdmin';
import {
  affectedKeys,
  buildingListsOverlap,
  parseOrgAdminAction,
  planBuildingCreate,
  planBuildingUpdate,
  planDomainCreate,
  planMemberDelete,
  planMemberUpdate,
  planOrgUpdate,
  planRoleUpsert,
  planSystemRolePerms,
  runOrgAdminAction,
  type Caller,
  type CallerTier,
} from './orgAdmin';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const superT: CallerTier = {
  emailLower: 'sa@x.edu',
  superAdmin: true,
  orgRole: '',
  buildingIds: [],
};
const domainT: CallerTier = {
  emailLower: 'da@x.edu',
  superAdmin: false,
  orgRole: 'domain_admin',
  buildingIds: [],
};
const bldgT: CallerTier = {
  emailLower: 'ba@x.edu',
  superAdmin: false,
  orgRole: 'building_admin',
  buildingIds: ['high'],
};
const teacherT: CallerTier = {
  emailLower: 't@x.edu',
  superAdmin: false,
  orgRole: 'teacher',
  buildingIds: ['high'],
};

const notAllowed = { reason: 'notAllowed' };

describe('affectedKeys', () => {
  it('counts added, removed and changed keys, comparing deeply', () => {
    expect(
      affectedKeys(
        { a: 1, b: [1, 2], c: { x: 1 }, d: 1 },
        { a: 1, b: [1, 2], c: { x: 2 }, e: 1 }
      ).sort()
    ).toEqual(['c', 'd', 'e']);
  });
});

describe('planOrgUpdate', () => {
  const org = { id: 'o', name: 'Old', plan: 'basic', status: 'active' };

  it('lets a domain admin change only identity fields', () => {
    expect(
      planOrgUpdate(domainT, org, { name: 'New', plan: 'basic' }).name
    ).toBe('New');
    expect(() => planOrgUpdate(domainT, org, { status: 'archived' })).toThrow(
      expect.objectContaining(notAllowed)
    );
    expect(() => planOrgUpdate(domainT, org, { aiEnabled: true })).toThrow(
      expect.objectContaining(notAllowed)
    );
  });

  it('lets a super admin change anything but a malformed managed auth', () => {
    expect(
      planOrgUpdate(superT, org, { status: 'archived', aiEnabled: true }).status
    ).toBe('archived');
    expect(
      planOrgUpdate(superT, org, {
        claudeManagedAuth: { enabled: true, issuer: 'https://id.example.com' },
      })
    ).toBeTruthy();
    expect(() =>
      planOrgUpdate(superT, org, {
        claudeManagedAuth: { enabled: true, issuer: 'http://bad' },
      })
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('refuses a building admin or teacher', () => {
    expect(() => planOrgUpdate(bldgT, org, { name: 'X' })).toThrow(
      expect.objectContaining(notAllowed)
    );
    expect(() => planOrgUpdate(teacherT, org, { name: 'X' })).toThrow(
      expect.objectContaining(notAllowed)
    );
  });
});

describe('buildings', () => {
  const rec = {
    id: 'b',
    orgId: 'o',
    name: 'B',
    type: 'other',
    address: '',
    grades: '',
    users: 0,
    adminEmails: [],
  };

  it('creates only for org admins, with users 0 and known keys', () => {
    expect(planBuildingCreate(domainT, 'o', rec)).toEqual(rec);
    expect(() => planBuildingCreate(bldgT, 'o', rec)).toThrow(
      expect.objectContaining(notAllowed)
    );
    expect(() =>
      planBuildingCreate(domainT, 'o', { ...rec, users: 3 })
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() => planBuildingCreate(domainT, 'other', rec)).toThrow(
      expect.objectContaining(notAllowed)
    );
    expect(() =>
      planBuildingCreate(domainT, 'o', { ...rec, extra: 1 })
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('lets a building admin edit only a building they manage, alias-aware', () => {
    const existing = { ...rec, id: 'orono-high-school' };
    expect(
      planBuildingUpdate(bldgT, 'orono-high-school', existing, { name: 'H' })
        .name
    ).toBe('H');
    expect(() =>
      planBuildingUpdate(
        bldgT,
        'middle',
        { ...rec, id: 'middle' },
        { name: 'M' }
      )
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('pins id, orgId and users below super admin', () => {
    expect(() => planBuildingUpdate(domainT, 'b', rec, { users: 9 })).toThrow(
      expect.objectContaining(notAllowed)
    );
    expect(() => planBuildingUpdate(domainT, 'b', rec, { orgId: 'x' })).toThrow(
      expect.objectContaining(notAllowed)
    );
    expect(planBuildingUpdate(superT, 'b', rec, { users: 9 }).users).toBe(9);
  });
});

describe('planDomainCreate', () => {
  const rec = {
    id: 'd',
    orgId: 'o',
    domain: '@x.edu',
    authMethod: 'google',
    status: 'pending',
    role: 'staff',
    users: 0,
    addedAt: 't',
  };
  it('requires pending, users 0 and a normalized domain', () => {
    expect(planDomainCreate(domainT, 'o', rec)).toEqual(rec);
    expect(() =>
      planDomainCreate(domainT, 'o', { ...rec, status: 'verified' })
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() =>
      planDomainCreate(domainT, 'o', { ...rec, domain: 'x.edu' })
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() => planDomainCreate(bldgT, 'o', rec)).toThrow(
      expect.objectContaining(notAllowed)
    );
  });
});

describe('roles', () => {
  const role = { id: 'r', name: 'R', blurb: '', color: 'c', perms: {} };
  it('creates and edits custom roles for org admins only', () => {
    expect(planRoleUpsert(domainT, role, undefined)).toEqual({
      ...role,
      system: false,
    });
    expect(
      planRoleUpsert(
        domainT,
        { ...role, name: 'R2' },
        { ...role, system: false }
      ).name
    ).toBe('R2');
    expect(() => planRoleUpsert(bldgT, role, undefined)).toThrow(
      expect.objectContaining(notAllowed)
    );
  });
  it('never overwrites a system role as a custom one', () => {
    expect(() =>
      planRoleUpsert(superT, role, { ...role, system: true })
    ).toThrow(expect.objectContaining(notAllowed));
  });
  it('lets only a super admin patch system role perms', () => {
    const sys = { ...role, system: true };
    expect(planSystemRolePerms(superT, sys, { a: true }).perms).toEqual({
      a: true,
    });
    expect(() => planSystemRolePerms(domainT, sys, { a: true })).toThrow(
      expect.objectContaining(notAllowed)
    );
    expect(() =>
      planSystemRolePerms(superT, { ...role, system: false }, {})
    ).toThrow(expect.objectContaining(notAllowed));
  });
});

describe('planMemberUpdate', () => {
  const member = (extra: StubData = {}): StubData => ({
    email: 'm@x.edu',
    orgId: 'o',
    roleId: 'teacher',
    buildingIds: ['orono-high-school'],
    status: 'active',
    ...extra,
  });

  it('refuses a status outside active, invited, inactive for everyone', () => {
    expect(() =>
      planMemberUpdate(superT, 'm@x.edu', member(), { status: 'removed' }, [])
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('lets a domain admin edit role, buildings and status', () => {
    expect(
      planMemberUpdate(
        domainT,
        'm@x.edu',
        member(),
        { roleId: 'building_admin', status: 'inactive' },
        []
      ).roleId
    ).toBe('building_admin');
    expect(() =>
      planMemberUpdate(domainT, 'm@x.edu', member(), { email: 'z@x.edu' }, [])
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('stops a domain admin granting, revoking or deactivating super admin', () => {
    expect(() =>
      planMemberUpdate(
        domainT,
        'm@x.edu',
        member(),
        { roleId: 'super_admin' },
        []
      )
    ).toThrow(expect.objectContaining(notAllowed));
    const sa = member({ roleId: 'super_admin' });
    expect(() =>
      planMemberUpdate(domainT, 'm@x.edu', sa, { roleId: 'teacher' }, [])
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() =>
      planMemberUpdate(domainT, 'm@x.edu', sa, { status: 'inactive' }, [])
    ).toThrow(expect.objectContaining(notAllowed));
    expect(
      planMemberUpdate(domainT, 'm@x.edu', sa, { name: 'N' }, []).name
    ).toBe('N');
  });

  it('stops a domain admin changing their own role or status', () => {
    expect(() =>
      planMemberUpdate(
        domainT,
        'da@x.edu',
        member({ email: 'da@x.edu', roleId: 'domain_admin' }),
        { status: 'inactive' },
        []
      )
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('keeps a legacy-listed address status for a super admin only', () => {
    expect(() =>
      planMemberUpdate(domainT, 'm@x.edu', member(), { status: 'inactive' }, [
        'm@x.edu',
      ])
    ).toThrow(expect.objectContaining(notAllowed));
    expect(
      planMemberUpdate(superT, 'm@x.edu', member(), { status: 'inactive' }, [
        'm@x.edu',
      ]).status
    ).toBe('inactive');
  });

  it('lets a building admin only deactivate a member of an overlapping building', () => {
    expect(
      planMemberUpdate(bldgT, 'm@x.edu', member(), { status: 'inactive' }, [])
        .status
    ).toBe('inactive');
    expect(() =>
      planMemberUpdate(
        bldgT,
        'm@x.edu',
        member({ status: 'inactive' }),
        { status: 'active' },
        []
      )
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() =>
      planMemberUpdate(
        bldgT,
        'm@x.edu',
        member({ buildingIds: ['middle'] }),
        { status: 'inactive' },
        []
      )
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() =>
      planMemberUpdate(
        bldgT,
        'm@x.edu',
        member({ roleId: 'domain_admin' }),
        { status: 'inactive' },
        []
      )
    ).toThrow(expect.objectContaining(notAllowed));
    expect(() =>
      planMemberUpdate(bldgT, 'm@x.edu', member(), { roleId: 'x' }, [])
    ).toThrow(expect.objectContaining(notAllowed));
  });

  it('refuses a teacher', () => {
    expect(() =>
      planMemberUpdate(
        teacherT,
        'm@x.edu',
        member(),
        { status: 'inactive' },
        []
      )
    ).toThrow(expect.objectContaining(notAllowed));
  });
});

describe('planMemberDelete', () => {
  it('stops a domain admin removing a super admin', () => {
    expect(() => planMemberDelete(domainT, { roleId: 'super_admin' })).toThrow(
      expect.objectContaining(notAllowed)
    );
    expect(() =>
      planMemberDelete(domainT, { roleId: 'teacher' })
    ).not.toThrow();
    expect(() =>
      planMemberDelete(superT, { roleId: 'super_admin' })
    ).not.toThrow();
    expect(() => planMemberDelete(bldgT, { roleId: 'teacher' })).toThrow(
      expect.objectContaining(notAllowed)
    );
  });
});

describe('buildingListsOverlap', () => {
  it('matches across alias forms and not across buildings', () => {
    expect(buildingListsOverlap(['high'], ['orono-high-school'])).toBe(true);
    expect(buildingListsOverlap(['high'], ['middle'])).toBe(false);
    expect(buildingListsOverlap([], ['high'])).toBe(false);
  });
});

describe('parseOrgAdminAction', () => {
  it('refuses a dotted patch key, which Firestore would read as a field path', () => {
    expect(() =>
      parseOrgAdminAction({
        action: 'updateOrg',
        orgId: 'o',
        patch: { 'claudeManagedAuth.issuer': 'x' },
      })
    ).toThrow(expect.objectContaining({ reason: 'invalidArgument' }));
  });

  it('refuses unknown actions and path-breaking ids', () => {
    expect(() => parseOrgAdminAction({ action: 'nope' })).toThrow(
      expect.objectContaining({ reason: 'invalidArgument' })
    );
    expect(() =>
      parseOrgAdminAction({ action: 'removeBuilding', orgId: 'o', id: 'a/b' })
    ).toThrow(expect.objectContaining({ reason: 'invalidArgument' }));
  });
});

describe('runOrgAdminAction', () => {
  const caller = (email: string, extra: Partial<Caller> = {}): Caller => ({
    emailLower: email,
    emailVerified: true,
    viewAs: false,
    ...extra,
  });
  const seed = (): Record<string, StubData> => ({
    'organizations/orono/members/sa@x.edu': {
      roleId: 'super_admin',
      status: 'active',
    },
    'organizations/o/members/da@x.edu': {
      email: 'da@x.edu',
      orgId: 'o',
      roleId: 'domain_admin',
      status: 'active',
      buildingIds: [],
    },
    'organizations/o/members/m1@x.edu': {
      email: 'm1@x.edu',
      orgId: 'o',
      roleId: 'teacher',
      status: 'active',
      buildingIds: [],
    },
    'organizations/o/members/m2@x.edu': {
      email: 'm2@x.edu',
      orgId: 'o',
      roleId: 'super_admin',
      status: 'active',
      buildingIds: [],
    },
    'organizations/o': { id: 'o', name: 'Org' },
  });
  const run = (db: unknown, c: Caller, a: unknown) =>
    runOrgAdminAction(
      db as admin.firestore.Firestore,
      c,
      parseOrgAdminAction(a)
    );

  it('refuses an unverified or View as caller before reading anything', async () => {
    const { db } = makeStubFirestore(seed());
    await expect(
      run(db, caller('da@x.edu', { emailVerified: false }), {
        action: 'updateOrg',
        orgId: 'o',
        patch: { name: 'X' },
      })
    ).rejects.toMatchObject(notAllowed);
    await expect(
      run(db, caller('da@x.edu', { viewAs: true }), {
        action: 'updateOrg',
        orgId: 'o',
        patch: { name: 'X' },
      })
    ).rejects.toMatchObject(notAllowed);
  });

  it('applies a domain admin bulk status change', async () => {
    const { db, store } = makeStubFirestore(seed());
    await run(db, caller('da@x.edu'), {
      action: 'updateMembers',
      orgId: 'o',
      ids: ['m1@x.edu'],
      patch: { status: 'inactive' },
    });
    expect(store.get('organizations/o/members/m1@x.edu')?.status).toBe(
      'inactive'
    );
  });

  it('writes nothing when one target in a bulk change is refused', async () => {
    const { db, store } = makeStubFirestore(seed());
    await expect(
      run(db, caller('da@x.edu'), {
        action: 'updateMembers',
        orgId: 'o',
        ids: ['m1@x.edu', 'm2@x.edu'],
        patch: { status: 'inactive' },
      })
    ).rejects.toMatchObject(notAllowed);
    expect(store.get('organizations/o/members/m1@x.edu')?.status).toBe(
      'active'
    );
  });

  it('removes members and leaves a tombstone', async () => {
    const { db, store } = makeStubFirestore(seed());
    await run(db, caller('da@x.edu'), {
      action: 'removeMembers',
      orgId: 'o',
      ids: ['m1@x.edu'],
    });
    expect(store.has('organizations/o/members/m1@x.edu')).toBe(false);
    expect(
      store.get('organizations/o/removedMembers/m1@x.edu')?.removedAt
    ).toEqual(expect.any(String));
  });

  it('treats a deactivated domain admin as no admin', async () => {
    const s = seed();
    s['organizations/o/members/da@x.edu'] = {
      ...s['organizations/o/members/da@x.edu'],
      status: 'inactive',
    };
    const { db } = makeStubFirestore(s);
    await expect(
      run(db, caller('da@x.edu'), {
        action: 'updateOrg',
        orgId: 'o',
        patch: { name: 'X' },
      })
    ).rejects.toMatchObject(notAllowed);
  });

  it('lets a super admin create an org but not over an existing one', async () => {
    const { db, store } = makeStubFirestore(seed());
    await run(db, caller('sa@x.edu'), {
      action: 'createOrg',
      record: { id: 'new', name: 'New', users: 0 },
    });
    expect(store.get('organizations/new')?.name).toBe('New');
    await expect(
      run(db, caller('sa@x.edu'), {
        action: 'createOrg',
        record: { id: 'o', name: 'Dup' },
      })
    ).rejects.toMatchObject({
      reason: 'alreadyExists',
    });
    await expect(
      run(db, caller('da@x.edu'), {
        action: 'createOrg',
        record: { id: 'x', name: 'X' },
      })
    ).rejects.toMatchObject(notAllowed);
  });

  it('saves roles in one transaction and skips a role already gone', async () => {
    const s = seed();
    s['organizations/o/roles/old'] = {
      id: 'old',
      name: 'Old',
      system: false,
      perms: {},
    };
    s['organizations/o/roles/teacher'] = {
      id: 'teacher',
      name: 'Teacher',
      system: true,
      perms: {},
    };
    const { db, store } = makeStubFirestore(s);
    await run(db, caller('da@x.edu'), {
      action: 'saveRoles',
      orgId: 'o',
      upserts: [{ id: 'new', name: 'New', blurb: '', color: 'c', perms: {} }],
      systemPerms: [],
      deletes: ['old', 'gone'],
    });
    expect(store.get('organizations/o/roles/new')?.system).toBe(false);
    expect(store.has('organizations/o/roles/old')).toBe(false);
    await expect(
      run(db, caller('da@x.edu'), {
        action: 'saveRoles',
        orgId: 'o',
        upserts: [],
        systemPerms: [],
        deletes: ['teacher'],
      })
    ).rejects.toMatchObject(notAllowed);
  });
});
