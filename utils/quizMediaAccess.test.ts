import { describe, it, expect } from 'vitest';
import { canAccessQuizMediaResponse } from './quizMediaAccess';
import type { GlobalFeaturePermission } from '@/types';

const record = (
  over: Partial<GlobalFeaturePermission> = {}
): GlobalFeaturePermission => ({
  featureId: 'quiz-media-response',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  ...over,
});

describe('canAccessQuizMediaResponse', () => {
  it('denies when no permission record exists, even for an admin', () => {
    expect(
      canAccessQuizMediaResponse({
        permission: undefined,
        isAdmin: true,
        email: 'a@b.com',
      })
    ).toBe(false);
  });

  it('denies a record that is not enabled', () => {
    expect(
      canAccessQuizMediaResponse({
        permission: record({ enabled: false }),
        isAdmin: true,
        email: 'a@b.com',
      })
    ).toBe(false);
  });

  it('grants a public enabled record to a signed-out-of-admin teacher', () => {
    expect(
      canAccessQuizMediaResponse({
        permission: record(),
        isAdmin: false,
        email: 'a@b.com',
      })
    ).toBe(true);
  });

  it('grants an admin-level record only to admins', () => {
    const permission = record({ accessLevel: 'admin' });
    expect(
      canAccessQuizMediaResponse({
        permission,
        isAdmin: true,
        email: 'a@b.com',
      })
    ).toBe(true);
    expect(
      canAccessQuizMediaResponse({
        permission,
        isAdmin: false,
        email: 'a@b.com',
      })
    ).toBe(false);
  });

  it('matches beta users case-insensitively and rejects everyone else', () => {
    const permission = record({
      accessLevel: 'beta',
      betaUsers: ['Teacher@School.org'],
    });
    expect(
      canAccessQuizMediaResponse({
        permission,
        isAdmin: false,
        email: 'teacher@school.org',
      })
    ).toBe(true);
    expect(
      canAccessQuizMediaResponse({
        permission,
        isAdmin: false,
        email: 'other@school.org',
      })
    ).toBe(false);
    expect(
      canAccessQuizMediaResponse({ permission, isAdmin: false, email: null })
    ).toBe(false);
  });
});
