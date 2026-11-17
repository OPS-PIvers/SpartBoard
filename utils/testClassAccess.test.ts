import { describe, it, expect } from 'vitest';
import { canReadTestClasses } from './testClassAccess';

describe('canReadTestClasses', () => {
  const orgId = 'org123';

  it('returns false if orgId is missing or whitespace', () => {
    expect(canReadTestClasses(null, 'super_admin')).toBe(false);
    expect(canReadTestClasses(undefined, 'super_admin')).toBe(false);
    expect(canReadTestClasses('', 'super_admin')).toBe(false);
    expect(canReadTestClasses('   ', 'super_admin')).toBe(false);
  });

  it('returns true if roleId is super_admin', () => {
    expect(canReadTestClasses(orgId, 'super_admin')).toBe(true);
  });

  it('returns true if roleId is domain_admin', () => {
    expect(canReadTestClasses(orgId, 'domain_admin')).toBe(true);
  });

  it('returns false for regular roles or no role', () => {
    expect(canReadTestClasses(orgId, 'teacher')).toBe(false);
    expect(canReadTestClasses(orgId, 'building_admin')).toBe(false);
    expect(canReadTestClasses(orgId, 'student')).toBe(false);
    expect(canReadTestClasses(orgId, null)).toBe(false);
    expect(canReadTestClasses(orgId, undefined)).toBe(false);
  });
});
