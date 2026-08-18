import { describe, it, expect } from 'vitest';
import { isBetaUser } from './betaAccess';
import type { UserRolesConfig } from '@/types';

const roles = (overrides: Partial<UserRolesConfig> = {}): UserRolesConfig => ({
  students: [],
  teachers: [],
  betaTeachers: [],
  admins: [],
  superAdmins: [],
  ...overrides,
});

describe('isBetaUser', () => {
  it('grants access via a case-insensitive betaUsers match', () => {
    expect(isBetaUser(['teacher@school.edu'], 'Teacher@School.edu')).toBe(true);
  });

  it('grants access via userRoles.betaTeachers, independent of betaUsers', () => {
    expect(
      isBetaUser(
        [],
        'teacher@school.edu',
        roles({ betaTeachers: ['teacher@school.edu'] })
      )
    ).toBe(true);
  });

  it('grants access via userRoles.superAdmins, independent of betaUsers', () => {
    expect(
      isBetaUser(
        [],
        'admin@school.edu',
        roles({ superAdmins: ['admin@school.edu'] })
      )
    ).toBe(true);
  });

  it('grants access via roleId === "super_admin", independent of any list', () => {
    expect(isBetaUser([], 'admin@school.edu', null, 'super_admin')).toBe(true);
  });

  it('denies access when the user matches none of the four sources', () => {
    expect(
      isBetaUser(
        ['other@school.edu'],
        'teacher@school.edu',
        roles({ betaTeachers: ['other@school.edu'] }),
        'teacher'
      )
    ).toBe(false);
  });

  it('denies access for a null/undefined email even with a non-empty betaUsers list', () => {
    expect(isBetaUser(['teacher@school.edu'], null)).toBe(false);
    expect(isBetaUser(['teacher@school.edu'], undefined)).toBe(false);
  });
});
