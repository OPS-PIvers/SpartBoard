import { describe, it, expect } from 'vitest';
import { studentLandingV2Scope } from './studentLandingV2';

describe('studentLandingV2Scope', () => {
  it('defers to the teacher gate without a doc, and is off when disabled', () => {
    expect(studentLandingV2Scope(undefined)).toBe('teachers');
    expect(
      studentLandingV2Scope({ enabled: false, accessLevel: 'public' })
    ).toBe('off');
  });

  it('is open to everyone only when Public with no building limit', () => {
    expect(
      studentLandingV2Scope({ enabled: true, accessLevel: 'public' })
    ).toBe('everyone');
    expect(
      studentLandingV2Scope({
        enabled: true,
        accessLevel: 'public',
        buildings: ['x'],
      })
    ).toBe('teachers');
  });

  it('defers to the teacher when Public is limited by building or tier', () => {
    expect(
      studentLandingV2Scope({
        enabled: true,
        accessLevel: 'public',
        minTier: 'org',
      })
    ).toBe('teachers');
  });

  it('defers to the teacher for Admin and Beta', () => {
    expect(studentLandingV2Scope({ enabled: true, accessLevel: 'admin' })).toBe(
      'teachers'
    );
    expect(studentLandingV2Scope({ enabled: true, accessLevel: 'beta' })).toBe(
      'teachers'
    );
  });
});
