import { describe, expect, it } from 'vitest';
import { isSuperAdminRoleId } from './authz';

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
