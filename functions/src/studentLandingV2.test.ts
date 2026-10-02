import { describe, it, expect } from 'vitest';
import {
  studentLandingV2Scope,
  teacherPassesLandingGate,
} from './studentLandingV2';

describe('studentLandingV2Scope', () => {
  it('is off without a doc or when disabled', () => {
    expect(studentLandingV2Scope(undefined)).toBe('off');
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

  it('defers to the teacher for Admin and Beta', () => {
    expect(studentLandingV2Scope({ enabled: true, accessLevel: 'admin' })).toBe(
      'teachers'
    );
    expect(studentLandingV2Scope({ enabled: true, accessLevel: 'beta' })).toBe(
      'teachers'
    );
  });
});

describe('teacherPassesLandingGate', () => {
  const beta = { accessLevel: 'beta', betaUsers: ['Tester@School.org'] };

  it('passes admins at any level', () => {
    expect(
      teacherPassesLandingGate({ accessLevel: 'admin' }, 'a@b.c', true)
    ).toBe(true);
  });

  it('passes a listed beta tester, ignoring case', () => {
    expect(teacherPassesLandingGate(beta, 'tester@school.org', false)).toBe(
      true
    );
  });

  it('refuses an unlisted teacher, and any non-admin at Admin level', () => {
    expect(teacherPassesLandingGate(beta, 'other@school.org', false)).toBe(
      false
    );
    expect(
      teacherPassesLandingGate(
        { accessLevel: 'admin', betaUsers: ['tester@school.org'] },
        'tester@school.org',
        false
      )
    ).toBe(false);
  });

  it('refuses a malformed beta list', () => {
    expect(
      teacherPassesLandingGate(
        { accessLevel: 'beta', betaUsers: 'tester@school.org' },
        'tester@school.org',
        false
      )
    ).toBe(false);
  });
});
