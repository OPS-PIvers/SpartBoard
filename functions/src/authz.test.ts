import { describe, expect, it } from 'vitest';
import { isStrictSuperAdmin, isSuperAdminRoleId } from './authz';

const EMAIL = 'boss@orono.k12.mn.us';

const dbWith = (docs: Record<string, Record<string, unknown>>) =>
  ({
    doc: (path: string) => ({
      get: () =>
        Promise.resolve({
          exists: path in docs,
          get: (field: string) => docs[path]?.[field],
        }),
    }),
  }) as never;

describe('isStrictSuperAdmin', () => {
  const memberPath = `organizations/orono/members/${EMAIL}`;

  it('admits an active operator-org super_admin', async () => {
    const db = dbWith({
      [memberPath]: { roleId: 'super_admin', status: 'active' },
    });
    await expect(isStrictSuperAdmin(db, EMAIL)).resolves.toBe(true);
  });

  it('admits a legacy-list super admin with no operator member doc', async () => {
    const db = dbWith({
      'admin_settings/user_roles': { superAdmins: [EMAIL] },
    });
    await expect(isStrictSuperAdmin(db, EMAIL)).resolves.toBe(true);
  });

  it.each(['inactive', 'removed'])(
    'refuses a %s operator-org super_admin, even on the legacy list',
    async (status) => {
      const db = dbWith({
        [memberPath]: { roleId: 'super_admin', status },
        'admin_settings/user_roles': { superAdmins: [EMAIL] },
      });
      await expect(isStrictSuperAdmin(db, EMAIL)).resolves.toBe(false);
      await expect(isStrictSuperAdmin(db, EMAIL, true)).resolves.toBe(true);
    }
  );
});

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
