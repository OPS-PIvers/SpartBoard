import { describe, it, expect } from 'vitest';
import { isStudentLandingV2Open } from './useStudentLandingV2';

describe('isStudentLandingV2Open', () => {
  it('is off without a doc or when disabled', () => {
    expect(isStudentLandingV2Open(undefined, ['a'])).toBe(false);
    expect(
      isStudentLandingV2Open(
        { enabled: false, accessLevel: 'public', betaClassIds: ['a'] },
        ['a']
      )
    ).toBe(false);
  });

  it('is on for everyone when Public with no building limit', () => {
    expect(
      isStudentLandingV2Open({ enabled: true, accessLevel: 'public' }, [])
    ).toBe(true);
    expect(
      isStudentLandingV2Open(
        { enabled: true, accessLevel: 'public', buildings: ['x'] },
        ['a']
      )
    ).toBe(false);
  });

  it('is on early only for a student with a listed class', () => {
    const permission = {
      enabled: true,
      accessLevel: 'admin' as const,
      betaClassIds: ['sec-1', 'sec-2'],
    };
    expect(isStudentLandingV2Open(permission, ['sec-9', 'sec-2'])).toBe(true);
    expect(isStudentLandingV2Open(permission, ['sec-9'])).toBe(false);
    expect(isStudentLandingV2Open(permission, [])).toBe(false);
  });

  it('ignores a malformed class list', () => {
    expect(
      isStudentLandingV2Open(
        {
          enabled: true,
          accessLevel: 'admin',
          betaClassIds: 'sec-1' as unknown as string[],
        },
        ['sec-1']
      )
    ).toBe(false);
  });
});
