import { describe, expect, it } from 'vitest';
import { OPERATOR_ORG_ID } from '@/config/organization';
import {
  isOrgOnlyAdmin,
  isSiteAdminActor,
  isSuperAdminActor,
} from './superAdmin';

describe('isSuperAdminActor', () => {
  it('accepts a member doc with the super_admin role in the operator org', () => {
    expect(isSuperAdminActor('a@b.c', 'super_admin', OPERATOR_ORG_ID)).toBe(
      true
    );
  });

  it('rejects a super_admin member doc from a non-operator org', () => {
    // isMemberSuperAdmin() in firestore.rules reads organizations/orono/members
    // by fixed path, so this roleId buys nothing server-side.
    expect(isSuperAdminActor('a@b.c', 'super_admin', 'other-district')).toBe(
      false
    );
  });

  it('rejects a super_admin member doc when the org is unresolved', () => {
    expect(isSuperAdminActor('a@b.c', 'super_admin', null)).toBe(false);
  });

  it('rejects a lesser member role or no member doc', () => {
    expect(isSuperAdminActor('a@b.c', 'domain_admin', OPERATOR_ORG_ID)).toBe(
      false
    );
    expect(isSuperAdminActor('a@b.c', null, OPERATOR_ORG_ID)).toBe(false);
  });

  it('rejects a caller with no email, as the rules do', () => {
    expect(isSuperAdminActor(null, 'super_admin', OPERATOR_ORG_ID)).toBe(false);
  });
});

describe('isOrgOnlyAdmin', () => {
  it('admits an admin of their own org without an /admins doc', () => {
    expect(isOrgOnlyAdmin(false, 'domain_admin', 'other-org')).toBe(true);
    expect(isOrgOnlyAdmin(false, 'building_admin', 'other-org')).toBe(true);
  });

  it('refuses while loading, for site admins, teachers and users without an org', () => {
    expect(isOrgOnlyAdmin(null, 'domain_admin', 'other-org')).toBe(false);
    expect(isOrgOnlyAdmin(true, 'domain_admin', 'orono')).toBe(false);
    expect(isOrgOnlyAdmin(false, 'teacher', 'other-org')).toBe(false);
    expect(isOrgOnlyAdmin(false, 'domain_admin', null)).toBe(false);
  });
});

describe('isSiteAdminActor', () => {
  const synced = (roleId: string, orgId: string = OPERATOR_ORG_ID) => ({
    source: 'organizationMembersSync',
    roleId,
    orgId,
  });

  it('passes a hand-made admin doc whatever member role the user holds', () => {
    expect(isSiteAdminActor(true, null)).toBe(true);
    expect(isSiteAdminActor(true, {})).toBe(true);
    expect(
      isSiteAdminActor(true, { roleId: 'building_admin', orgId: 'other-org' })
    ).toBe(true);
  });

  it('passes a synced district super or domain admin', () => {
    expect(isSiteAdminActor(true, synced('domain_admin'))).toBe(true);
    expect(isSiteAdminActor(true, synced('super_admin'))).toBe(true);
  });

  it('refuses a synced building admin, another org and a non-admin', () => {
    expect(isSiteAdminActor(true, synced('building_admin'))).toBe(false);
    expect(isSiteAdminActor(true, synced('domain_admin', 'other-org'))).toBe(
      false
    );
    expect(isSiteAdminActor(false, null)).toBe(false);
    expect(isSiteAdminActor(null, null)).toBe(false);
  });
});
