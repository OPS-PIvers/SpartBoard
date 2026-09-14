import { describe, it, expect } from 'vitest';
import type { FeaturePermission } from '@/types';
import {
  DEFAULT_QUIZ_HAND_RAISE_MODE,
  readQuizHandRaiseMode,
  resolveGateBuildingIds,
  resolveQuizHandRaiseEnabled,
} from '@/utils/quizHandRaise';

const permission = (config: unknown): FeaturePermission =>
  ({
    widgetType: 'quiz',
    accessLevel: 'public',
    betaUsers: [],
    enabled: true,
    config,
  }) as FeaturePermission;

describe('readQuizHandRaiseMode', () => {
  it('defaults to teacher-choice with no permissions or building', () => {
    expect(readQuizHandRaiseMode(null, 'b1')).toBe(
      DEFAULT_QUIZ_HAND_RAISE_MODE
    );
    expect(readQuizHandRaiseMode([], null)).toBe(DEFAULT_QUIZ_HAND_RAISE_MODE);
  });

  it('reads the mode for the given building', () => {
    const perms = [
      permission({
        buildingDefaults: {
          b1: { handRaiseMode: 'force-on' },
          b2: { handRaiseMode: 'force-off' },
        },
      }),
    ];
    expect(readQuizHandRaiseMode(perms, 'b1')).toBe('force-on');
    expect(readQuizHandRaiseMode(perms, 'b2')).toBe('force-off');
    expect(readQuizHandRaiseMode(perms, 'b3')).toBe('teacher-choice');
  });

  it('canonicalizes legacy building keys on both sides of the lookup', () => {
    const perms = [
      permission({
        buildingDefaults: {
          'orono-high-school': { handRaiseMode: 'force-on' },
        },
      }),
    ];
    expect(readQuizHandRaiseMode(perms, 'high')).toBe('force-on');
    expect(readQuizHandRaiseMode(perms, ['orono-high-school'])).toBe(
      'force-on'
    );
  });

  it('resolves across all buildings, most restrictive first', () => {
    const perms = [
      permission({
        buildingDefaults: {
          high: { handRaiseMode: 'force-on' },
          middle: { handRaiseMode: 'force-off' },
        },
      }),
    ];
    expect(readQuizHandRaiseMode(perms, ['high', 'middle'])).toBe('force-off');
    expect(readQuizHandRaiseMode(perms, ['high', 'schumann'])).toBe('force-on');
    expect(readQuizHandRaiseMode(perms, ['schumann'])).toBe('teacher-choice');
    // No building resolved: the default applies, never another tenant's gate.
    expect(readQuizHandRaiseMode(perms, [])).toBe('teacher-choice');
  });

  it('falls back to the default for an unknown stored value', () => {
    const perms = [
      permission({ buildingDefaults: { b1: { handRaiseMode: 'nonsense' } } }),
    ];
    expect(readQuizHandRaiseMode(perms, 'b1')).toBe('teacher-choice');
  });
});

describe('resolveQuizHandRaiseEnabled', () => {
  it('lets the teacher decide under teacher-choice, defaulting to off', () => {
    expect(resolveQuizHandRaiseEnabled('teacher-choice', true)).toBe(true);
    expect(resolveQuizHandRaiseEnabled('teacher-choice', false)).toBe(false);
    expect(resolveQuizHandRaiseEnabled('teacher-choice', undefined)).toBe(
      false
    );
  });

  it('force-on wins over any teacher choice', () => {
    expect(resolveQuizHandRaiseEnabled('force-on', false)).toBe(true);
    expect(resolveQuizHandRaiseEnabled('force-on', undefined)).toBe(true);
    expect(resolveQuizHandRaiseEnabled('force-on', true)).toBe(true);
  });

  it('force-off wins over any teacher choice', () => {
    expect(resolveQuizHandRaiseEnabled('force-off', true)).toBe(false);
    expect(resolveQuizHandRaiseEnabled('force-off', undefined)).toBe(false);
  });
});

describe('empty building selection', () => {
  it('never inherits another tenant’s configured gate', () => {
    const perms = [
      permission({
        buildingDefaults: {
          b1: { handRaiseMode: 'teacher-choice' },
          b2: { handRaiseMode: 'force-off' },
        },
      }),
    ];
    expect(readQuizHandRaiseMode(perms, [])).toBe('teacher-choice');
    expect(readQuizHandRaiseMode(perms, null)).toBe('teacher-choice');
  });

  it('gives a no-org teacher teacher-choice even when a building forces on', () => {
    const perms = [
      permission({ buildingDefaults: { b1: { handRaiseMode: 'force-on' } } }),
    ];
    expect(readQuizHandRaiseMode(perms, [])).toBe('teacher-choice');
  });
});

describe('resolveGateBuildingIds', () => {
  it('unions org membership buildings with the Profile filter', () => {
    expect(resolveGateBuildingIds(['b2'], ['b1'])).toEqual(['b2', 'b1']);
    expect(resolveGateBuildingIds(['b1'], ['b1'])).toEqual(['b1']);
  });

  it('a permissive Profile building cannot remove a membership force-off', () => {
    const perms = [
      permission({
        buildingDefaults: {
          b1: { handRaiseMode: 'teacher-choice' },
          b2: { handRaiseMode: 'force-off' },
        },
      }),
    ];
    expect(
      readQuizHandRaiseMode(perms, resolveGateBuildingIds(['b2'], ['b1']))
    ).toBe('force-off');
  });

  it('falls back to selected buildings when membership is unknown', () => {
    expect(resolveGateBuildingIds([], ['b1'])).toEqual(['b1']);
    expect(resolveGateBuildingIds(null, 'b1')).toEqual(['b1']);
  });

  it('returns nothing when both are empty, so the gate stays conservative', () => {
    expect(resolveGateBuildingIds([], [])).toEqual([]);
    expect(resolveGateBuildingIds(undefined, undefined)).toEqual([]);
  });

  it('cannot be bypassed by clearing selected buildings in Profile', () => {
    const perms = [
      permission({ buildingDefaults: { b2: { handRaiseMode: 'force-off' } } }),
    ];
    expect(
      readQuizHandRaiseMode(perms, resolveGateBuildingIds(['b2'], []))
    ).toBe('force-off');
  });
});
