import { describe, expect, it } from 'vitest';
import { isSuperAdminActor } from './superAdmin';

describe('isSuperAdminActor', () => {
  it('accepts a member doc with the super_admin role', () => {
    expect(isSuperAdminActor('a@b.c', [], 'super_admin')).toBe(true);
  });

  it('accepts the legacy superAdmins list, case-insensitively', () => {
    expect(
      isSuperAdminActor('Admin@School.org', ['admin@school.org'], null)
    ).toBe(true);
  });

  it('rejects a lesser member role that is not on the legacy list', () => {
    expect(isSuperAdminActor('a@b.c', ['other@b.c'], 'domain_admin')).toBe(
      false
    );
  });

  it('rejects a caller with no email, as the rules do', () => {
    expect(isSuperAdminActor(null, ['a@b.c'], 'super_admin')).toBe(false);
  });

  it('tolerates a missing superAdmins list', () => {
    expect(isSuperAdminActor('a@b.c', undefined, null)).toBe(false);
  });
});
