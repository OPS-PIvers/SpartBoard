import { describe, it, expect } from 'vitest';
import { matchesUserBuilding } from '@/config/widgetGradeLevels';
import type { FeaturePermission, WidgetType } from '@/types';

const perm = (
  widgetType: WidgetType,
  gradeLevels?: FeaturePermission['gradeLevels']
): FeaturePermission => ({
  widgetType,
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  gradeLevels,
});

describe('matchesUserBuilding', () => {
  it('returns true for any widget when userGradeLevels is empty', () => {
    // Emulates a teacher with no building selected — filter is inert.
    expect(matchesUserBuilding('clock', [], [])).toBe(true);
    expect(matchesUserBuilding('qr', [], [perm('qr', [])])).toBe(true);
    expect(
      matchesUserBuilding('traffic', [], [perm('traffic', ['9-12'])])
    ).toBe(true);
  });

  it('falls back to the widget default when permission.gradeLevels is empty', () => {
    // Regression: `permission?.gradeLevels ?? default` used to keep `[]`, which
    // caused `[].some(...)` to be false and hid the widget from every user.
    // `clock` defaults to ALL_GRADE_LEVELS, so a 9-12 user should still match.
    expect(matchesUserBuilding('clock', ['9-12'], [perm('clock', [])])).toBe(
      true
    );
    // `traffic` defaults to ['k-2', '3-5']; a 9-12 user should NOT match the
    // default, proving the fallback is applied (not an unconditional true).
    expect(
      matchesUserBuilding('traffic', ['9-12'], [perm('traffic', [])])
    ).toBe(false);
  });

  it('honors a non-empty admin override that intersects userGradeLevels', () => {
    expect(
      matchesUserBuilding('clock', ['9-12'], [perm('clock', ['9-12'])])
    ).toBe(true);
  });

  it('honors a non-empty admin override that does NOT intersect userGradeLevels', () => {
    expect(
      matchesUserBuilding('clock', ['9-12'], [perm('clock', ['k-2'])])
    ).toBe(false);
  });

  it('falls back to the widget default when no permission exists for the type', () => {
    // `qr` defaults to ['6-8', '9-12'].
    expect(matchesUserBuilding('qr', ['9-12'], [])).toBe(true);
    expect(matchesUserBuilding('qr', ['k-2'], [])).toBe(false);
  });

  it('ignores permissions for unrelated widget types', () => {
    // A permission for `traffic` must not affect the `clock` lookup.
    expect(
      matchesUserBuilding('clock', ['9-12'], [perm('traffic', ['k-2'])])
    ).toBe(true);
  });
});
