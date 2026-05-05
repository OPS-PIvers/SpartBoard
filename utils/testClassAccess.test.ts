import { describe, it, expect } from 'vitest';
import { canReadTestClasses } from './testClassAccess';
import { UserRolesConfig } from '@/types';

describe('canReadTestClasses', () => {
  const orgId = 'org123';
  const mockUserRoles: UserRolesConfig = {
    students: [],
    teachers: [],
    betaTeachers: [],
    admins: [],
    superAdmins: ['super@example.com'],
  };

  it('returns false if orgId is missing', () => {
    expect(
      canReadTestClasses(
        null,
        'super_admin',
        mockUserRoles,
        'super@example.com'
      )
    ).toBe(false);
    expect(
      canReadTestClasses(
        undefined,
        'super_admin',
        mockUserRoles,
        'super@example.com'
      )
    ).toBe(false);
    expect(
      canReadTestClasses('', 'super_admin', mockUserRoles, 'super@example.com')
    ).toBe(false);
  });

  it('returns true if roleId is super_admin', () => {
    expect(canReadTestClasses(orgId, 'super_admin', null, null)).toBe(true);
  });

  it('returns true if roleId is domain_admin', () => {
    expect(canReadTestClasses(orgId, 'domain_admin', null, null)).toBe(true);
  });

  it('returns true if userEmail is in superAdmins list (case-insensitive)', () => {
    expect(
      canReadTestClasses(orgId, 'teacher', mockUserRoles, 'super@example.com')
    ).toBe(true);
    expect(
      canReadTestClasses(orgId, 'teacher', mockUserRoles, 'SUPER@EXAMPLE.COM')
    ).toBe(true);
  });

  it('returns false for regular roles and user not in superAdmins', () => {
    expect(
      canReadTestClasses(orgId, 'teacher', mockUserRoles, 'teacher@example.com')
    ).toBe(false);
    expect(
      canReadTestClasses(orgId, 'student', mockUserRoles, 'student@example.com')
    ).toBe(false);
    expect(
      canReadTestClasses(orgId, null, mockUserRoles, 'someone@example.com')
    ).toBe(false);
  });

  it('handles null or undefined userRoles or userEmail when not super_admin/domain_admin', () => {
    expect(
      canReadTestClasses(orgId, 'teacher', null, 'teacher@example.com')
    ).toBe(false);
    expect(canReadTestClasses(orgId, 'teacher', mockUserRoles, null)).toBe(
      false
    );
    expect(canReadTestClasses(orgId, 'teacher', undefined, undefined)).toBe(
      false
    );
  });

  it('returns false if userEmail matches but userRoles is missing', () => {
    expect(
      canReadTestClasses(orgId, 'teacher', undefined, 'super@example.com')
    ).toBe(false);
  });
});
