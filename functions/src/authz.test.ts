import { describe, expect, it } from 'vitest';
import {
  isRevokedMemberStatus,
  isStrictSuperAdmin,
  isSuperAdminRoleId,
} from './authz';

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

  it('still admits the legacy superAdmins list', async () => {
    expect(
      await isStrictSuperAdmin(
        fakeDb({ roleId: 'super_admin', status: 'inactive' }, [email]),
        email
      )
    ).toBe(true);
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
