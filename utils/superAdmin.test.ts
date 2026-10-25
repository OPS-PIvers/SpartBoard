import { describe, expect, it } from 'vitest';
import { OPERATOR_ORG_ID } from '@/config/organization';
import { isOrgOnlyAdmin, isSuperAdminActor } from './superAdmin';

describe('isSuperAdminActor', () => {
  it('accepts a member doc with the super_admin role in the operator org', () => {
    expect(isSuperAdminActor('a@b.c', [], 'super_admin', OPERATOR_ORG_ID)).toBe(
      true
    );
  });

  it('rejects a super_admin member doc from a non-operator org', () => {
    // isMemberSuperAdmin() in firestore.rules reads organizations/orono/members
    // by fixed path, so this roleId buys nothing server-side.
    expect(
      isSuperAdminActor('a@b.c', [], 'super_admin', 'other-district')
    ).toBe(false);
  });

  it('rejects a super_admin member doc when the org is unresolved', () => {
    expect(isSuperAdminActor('a@b.c', [], 'super_admin', null)).toBe(false);
  });

  it('still accepts the legacy list for a non-operator-org member', () => {
    expect(
      isSuperAdminActor(
        'admin@school.org',
        ['admin@school.org'],
        'super_admin',
        'other-district'
      )
    ).toBe(true);
  });

  it('accepts the legacy superAdmins list, case-insensitively', () => {
    expect(
      isSuperAdminActor('Admin@School.org', ['admin@school.org'], null, null)
    ).toBe(true);
  });

  it('rejects a lesser member role that is not on the legacy list', () => {
    expect(
      isSuperAdminActor('a@b.c', ['other@b.c'], 'domain_admin', OPERATOR_ORG_ID)
    ).toBe(false);
  });

  it('rejects a caller with no email, as the rules do', () => {
    expect(
      isSuperAdminActor(null, ['a@b.c'], 'super_admin', OPERATOR_ORG_ID)
    ).toBe(false);
  });

  it('tolerates a missing superAdmins list', () => {
    expect(isSuperAdminActor('a@b.c', undefined, null, OPERATOR_ORG_ID)).toBe(
      false
    );
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
