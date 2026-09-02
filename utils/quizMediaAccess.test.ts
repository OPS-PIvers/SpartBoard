import { describe, it, expect, vi } from 'vitest';
import {
  canAccessQuizMediaResponse,
  type ResolvePermissionAccess,
} from './quizMediaAccess';
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

// Stand-in for AuthContext's resolvePermissionAccess, including the two gates
// the helper used to skip: minTier and buildings.
const resolver =
  (opts: {
    isAdmin?: boolean;
    tier?: string;
    selectedBuildings?: string[];
  }): ResolvePermissionAccess =>
  (permission, email) => {
    if (!permission.enabled) return false;
    if (opts.isAdmin) return true;
    if (permission.accessLevel === 'admin') return false;
    if (permission.accessLevel === 'beta') {
      const list = (permission.betaUsers ?? []).map((u) => u.toLowerCase());
      if (!email || !list.includes(email.toLowerCase())) return false;
    }
    if (permission.minTier && permission.minTier !== (opts.tier ?? 'free'))
      return false;
    if (permission.buildings && permission.buildings.length > 0) {
      const allowed = new Set(permission.buildings);
      if (!(opts.selectedBuildings ?? []).some((b) => allowed.has(b)))
        return false;
    }
    return true;
  };

describe('canAccessQuizMediaResponse', () => {
  it('denies when no permission record exists, even for an admin, without consulting the resolver', () => {
    const resolveAccess = vi.fn(() => true);
    expect(
      canAccessQuizMediaResponse({
        permission: undefined,
        email: 'a@b.com',
        resolveAccess,
      })
    ).toBe(false);
    expect(resolveAccess).not.toHaveBeenCalled();
  });

  it('delegates an existing record to resolvePermissionAccess verbatim', () => {
    const permission = record();
    const resolveAccess = vi.fn(() => true);
    expect(
      canAccessQuizMediaResponse({
        permission,
        email: 'a@b.com',
        resolveAccess,
      })
    ).toBe(true);
    expect(resolveAccess).toHaveBeenCalledWith(permission, 'a@b.com');
  });

  it('denies a record that is not enabled', () => {
    expect(
      canAccessQuizMediaResponse({
        permission: record({ enabled: false }),
        email: 'a@b.com',
        resolveAccess: resolver({ isAdmin: true }),
      })
    ).toBe(false);
  });

  it('grants an admin-level record only to admins', () => {
    const permission = record({ accessLevel: 'admin' });
    expect(
      canAccessQuizMediaResponse({
        permission,
        email: 'a@b.com',
        resolveAccess: resolver({ isAdmin: true }),
      })
    ).toBe(true);
    expect(
      canAccessQuizMediaResponse({
        permission,
        email: 'a@b.com',
        resolveAccess: resolver({}),
      })
    ).toBe(false);
  });

  it('honours the buildings restriction the server also enforces', () => {
    const permission = record({ buildings: ['oms'] });
    expect(
      canAccessQuizMediaResponse({
        permission,
        email: 'a@b.com',
        resolveAccess: resolver({ selectedBuildings: ['oms'] }),
      })
    ).toBe(true);
    expect(
      canAccessQuizMediaResponse({
        permission,
        email: 'a@b.com',
        resolveAccess: resolver({ selectedBuildings: ['ohs'] }),
      })
    ).toBe(false);
  });

  it('honours the minTier floor the server also enforces', () => {
    const permission = record({ minTier: 'org' });
    expect(
      canAccessQuizMediaResponse({
        permission,
        email: 'a@b.com',
        resolveAccess: resolver({ tier: 'org' }),
      })
    ).toBe(true);
    expect(
      canAccessQuizMediaResponse({
        permission,
        email: 'a@b.com',
        resolveAccess: resolver({ tier: 'free' }),
      })
    ).toBe(false);
  });
});
