import { describe, expect, it } from 'vitest';
import {
  isLiveAdmin,
  isLiveCaller,
  isRevokedMemberStatus,
  isSiteWideAdmin,
  isStrictSuperAdmin,
  isSuperAdminRoleId,
} from './authz';
import { makeStubFirestore } from './testing/stubFirestore';

describe('isSuperAdminRoleId', () => {
  it('treats a legacy doc with no roleId as site-wide', () => {
    expect(isSuperAdminRoleId(undefined, undefined)).toBe(true);
  });

  it('admits super_admin and domain_admin mirrored from the operator org', () => {
    expect(isSuperAdminRoleId('super_admin', 'orono')).toBe(true);
    expect(isSuperAdminRoleId('domain_admin', 'orono')).toBe(true);
  });

  it('refuses a domain_admin or super_admin mirrored from another org', () => {
    expect(isSuperAdminRoleId('domain_admin', 'other-org')).toBe(false);
    expect(isSuperAdminRoleId('super_admin', 'other-org')).toBe(false);
  });

  it('refuses building_admin from any org', () => {
    expect(isSuperAdminRoleId('building_admin', 'orono')).toBe(false);
  });
});

const fakeDb = (
  member: Record<string, unknown> | null,
  superAdmins: string[] | null = null
) =>
  ({
    doc: (path: string) => ({
      get: () => {
        const data =
          path === 'admin_settings/user_roles'
            ? superAdmins && { superAdmins }
            : member;
        return Promise.resolve({
          exists: data !== null,
          get: (k: string) => (data ? data[k] : undefined),
          data: () => data ?? undefined,
        });
      },
    }),
  }) as unknown as Parameters<typeof isStrictSuperAdmin>[0];

describe('isRevokedMemberStatus', () => {
  it('keeps active, invited and a missing status', () => {
    expect(isRevokedMemberStatus('active')).toBe(false);
    expect(isRevokedMemberStatus('invited')).toBe(false);
    expect(isRevokedMemberStatus(undefined)).toBe(false);
  });

  it('revokes inactive and any other stored value', () => {
    for (const s of ['inactive', 'removed', 'foo', '', null, 1]) {
      expect(isRevokedMemberStatus(s)).toBe(true);
    }
  });
});

describe('isStrictSuperAdmin', () => {
  const email = 'boss@orono.k12.mn.us';

  it('admits an active or status-less super_admin member', async () => {
    expect(
      await isStrictSuperAdmin(
        fakeDb({ roleId: 'super_admin', status: 'active' }),
        email
      )
    ).toBe(true);
    expect(
      await isStrictSuperAdmin(fakeDb({ roleId: 'super_admin' }), email)
    ).toBe(true);
  });

  it('refuses a super_admin member with any other status', async () => {
    for (const status of ['inactive', 'invited', 'removed', null]) {
      expect(
        await isStrictSuperAdmin(
          fakeDb({ roleId: 'super_admin', status }),
          email
        )
      ).toBe(false);
    }
  });

  it('ignores the retired legacy superAdmins list', async () => {
    expect(await isStrictSuperAdmin(fakeDb(null, [email]), email)).toBe(false);
    for (const status of ['active', 'invited', undefined]) {
      expect(
        await isStrictSuperAdmin(
          fakeDb({ roleId: 'teacher', status }, [email]),
          email
        )
      ).toBe(false);
    }
  });

  it('refuses domain_admin', async () => {
    expect(
      await isStrictSuperAdmin(
        fakeDb({ roleId: 'domain_admin', status: 'active' }),
        email
      )
    ).toBe(false);
  });
});

describe('isSiteWideAdmin', () => {
  const email = 'boss@orono.k12.mn.us';

  it('admits a legacy /admins doc with no orono member doc or a live one', async () => {
    expect(
      await isSiteWideAdmin(fakeDb(null), email, undefined, undefined)
    ).toBe(true);
    expect(
      await isSiteWideAdmin(
        fakeDb({ roleId: 'teacher', status: 'active' }),
        email,
        undefined,
        undefined
      )
    ).toBe(true);
  });

  it('refuses any /admins doc once the orono member doc is deactivated', async () => {
    const db = fakeDb({ roleId: 'super_admin', status: 'inactive' });
    expect(await isSiteWideAdmin(db, email, undefined, undefined)).toBe(false);
    expect(await isSiteWideAdmin(db, email, 'super_admin', 'orono')).toBe(
      false
    );
    expect(await isSiteWideAdmin(db, email, 'domain_admin', 'other-org')).toBe(
      false
    );
  });

  it('keeps the other-org fallback to an active orono super or domain admin', async () => {
    expect(
      await isSiteWideAdmin(
        fakeDb({ roleId: 'domain_admin', status: 'active' }),
        email,
        'building_admin',
        'other-org'
      )
    ).toBe(true);
    expect(
      await isSiteWideAdmin(
        fakeDb({ roleId: 'teacher', status: 'active' }),
        email,
        'building_admin',
        'other-org'
      )
    ).toBe(false);
  });
});

describe('isLiveCaller and isLiveAdmin', () => {
  const db = makeStubFirestore({
    'admins/live@x.org': {},
    'admins/gone@x.org': {},
    'admins/invited@x.org': {},
    'organizations/orono/members/live@x.org': { status: 'active' },
    'organizations/orono/members/gone@x.org': { status: 'deactivated' },
    'organizations/orono/members/invited@x.org': { status: 'invited' },
  }).db as never;

  it('refuses the deactivation claim and a revoked operator-org member doc', async () => {
    expect(await isLiveCaller(db, { deactivated: true })).toBe(false);
    expect(await isLiveCaller(db, { email: 'Gone@x.org' })).toBe(false);
    expect(await isLiveCaller(db, { email: 'live@x.org' })).toBe(true);
    expect(await isLiveCaller(db, { email: 'nomember@x.org' })).toBe(true);
    expect(await isLiveCaller(db, {})).toBe(true);
    expect(await isLiveCaller(db, undefined)).toBe(true);
  });

  it('admits an /admins doc only while its holder is not deactivated', async () => {
    expect(await isLiveAdmin(db, 'Live@x.org')).toBe(true);
    expect(await isLiveAdmin(db, 'invited@x.org')).toBe(true);
    expect(await isLiveAdmin(db, 'gone@x.org')).toBe(false);
    expect(await isLiveAdmin(db, 'stranger@x.org')).toBe(false);
    expect(await isLiveAdmin(db, '')).toBe(false);
    expect(await isLiveAdmin(db, 'live@x.org', { deactivated: true })).toBe(
      false
    );
    expect(await isLiveAdmin(db, 'live@x.org', { email: 'live@x.org' })).toBe(
      true
    );
  });
});
