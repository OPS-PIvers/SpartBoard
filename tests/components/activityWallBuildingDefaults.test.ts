import { describe, it, expect } from 'vitest';
import { resolveActivityWallBuildingDefaults } from '@/components/widgets/ActivityWall/buildingDefaults';
import type { FeaturePermission } from '@/types';

const makePerm = (
  buildingDefaults: Record<string, Record<string, unknown>>
): FeaturePermission => ({
  widgetType: 'activity-wall',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: { buildingDefaults } as FeaturePermission['config'],
});

describe('resolveActivityWallBuildingDefaults', () => {
  it('returns empty object when no buildings selected', () => {
    const perm = makePerm({ high: { defaultMode: 'photo' } });
    expect(resolveActivityWallBuildingDefaults([perm], [])).toEqual({});
  });

  it('returns empty object when there is no activity-wall permission', () => {
    expect(resolveActivityWallBuildingDefaults([], ['high'])).toEqual({});
  });

  it('returns empty object when the building has no defaults', () => {
    const perm = makePerm({ high: { defaultMode: 'photo' } });
    expect(resolveActivityWallBuildingDefaults([perm], ['middle'])).toEqual({});
  });

  it('resolves all three default fields for the selected building', () => {
    const perm = makePerm({
      high: {
        defaultMode: 'photo',
        defaultIdentificationMode: 'name',
        defaultModerationEnabled: true,
      },
    });
    expect(resolveActivityWallBuildingDefaults([perm], ['high'])).toEqual({
      mode: 'photo',
      identificationMode: 'name',
      moderationEnabled: true,
    });
  });

  it('only takes the first selected building as the active key', () => {
    const perm = makePerm({
      high: { defaultMode: 'photo' },
      middle: { defaultMode: 'text' },
    });
    expect(
      resolveActivityWallBuildingDefaults([perm], ['middle', 'high'])
    ).toEqual({ mode: 'text' });
  });

  it('canonicalizes legacy building IDs via the alias map', () => {
    const perm = makePerm({
      'orono-high-school': { defaultIdentificationMode: 'name-pin' },
    });
    expect(resolveActivityWallBuildingDefaults([perm], ['high'])).toEqual({
      identificationMode: 'name-pin',
    });
  });

  it('ignores invalid persisted values', () => {
    const perm = makePerm({
      high: {
        defaultMode: 'video', // not a valid ActivityWallMode
        defaultIdentificationMode: 'sso', // not a valid identification mode
        defaultModerationEnabled: 'yes', // not a boolean
      },
    });
    expect(resolveActivityWallBuildingDefaults([perm], ['high'])).toEqual({});
  });

  it('keeps moderationEnabled:false (a meaningful explicit default)', () => {
    const perm = makePerm({ high: { defaultModerationEnabled: false } });
    expect(resolveActivityWallBuildingDefaults([perm], ['high'])).toEqual({
      moderationEnabled: false,
    });
  });
});
