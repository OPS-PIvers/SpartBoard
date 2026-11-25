import { describe, it, expect } from 'vitest';
import type { FeaturePermission } from '@/types';
import { resolveWidgetAccess, type WidgetAccessContext } from './widgetAccess';

const teacher: WidgetAccessContext = {
  isAdmin: false,
  email: 'ann@school.org',
  isBetaUser: (list, email) => list.includes(email ?? ''),
  userTier: 'internal',
  selectedBuildings: ['high'],
};
const admin: WidgetAccessContext = { ...teacher, isAdmin: true };

const perm = (over: Partial<FeaturePermission> = {}): FeaturePermission => ({
  widgetType: 'clock',
  enabled: true,
  accessLevel: 'public',
  betaUsers: [],
  ...over,
});

describe('resolveWidgetAccess', () => {
  it('opens a widget with no doc unless it defaults to admin-only', () => {
    expect(resolveWidgetAccess('clock', undefined, teacher)).toBe(true);
    expect(resolveWidgetAccess('flashcards', undefined, teacher)).toBe(false);
    expect(resolveWidgetAccess('flashcards', undefined, admin)).toBe(true);
  });

  it('keeps the default tier floor when there is no doc', () => {
    expect(
      resolveWidgetAccess('calendar', undefined, {
        ...teacher,
        userTier: 'free',
      })
    ).toBe(false);
    expect(resolveWidgetAccess('calendar', undefined, teacher)).toBe(true);
  });

  it('lets disabled and excluded beat admin status', () => {
    expect(resolveWidgetAccess('clock', perm({ enabled: false }), admin)).toBe(
      false
    );
    expect(
      resolveWidgetAccess(
        'clock',
        perm({ excludedUsers: ['ann@school.org'] }),
        admin
      )
    ).toBe(false);
  });

  it('applies access level, beta list, tier and buildings to teachers', () => {
    expect(
      resolveWidgetAccess('clock', perm({ accessLevel: 'admin' }), teacher)
    ).toBe(false);
    expect(
      resolveWidgetAccess(
        'clock',
        perm({ accessLevel: 'beta', betaUsers: ['ann@school.org'] }),
        teacher
      )
    ).toBe(true);
    expect(
      resolveWidgetAccess('clock', perm({ minTier: 'internal' }), {
        ...teacher,
        userTier: 'org',
      })
    ).toBe(false);
    expect(
      resolveWidgetAccess('clock', perm({ buildings: ['middle'] }), teacher)
    ).toBe(false);
    expect(
      resolveWidgetAccess('clock', perm({ buildings: ['high'] }), teacher)
    ).toBe(true);
    expect(
      resolveWidgetAccess('clock', perm({ buildings: ['middle'] }), admin)
    ).toBe(true);
  });
});
