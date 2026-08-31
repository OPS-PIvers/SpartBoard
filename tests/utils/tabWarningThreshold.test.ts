import { describe, it, expect } from 'vitest';
import {
  getEffectiveTabWarningThreshold,
  hasReachedTabWarningThreshold,
  resolveStudentTabWarningThreshold,
  DEFAULT_TAB_WARNING_THRESHOLD,
} from '@/utils/tabWarningThreshold';

describe('getEffectiveTabWarningThreshold', () => {
  it('defaults to 3 when neither session nor override is set', () => {
    expect(getEffectiveTabWarningThreshold(undefined)).toBe(3);
    expect(DEFAULT_TAB_WARNING_THRESHOLD).toBe(3);
  });

  it('uses the session value when set and no override is present', () => {
    expect(getEffectiveTabWarningThreshold(5)).toBe(5);
    expect(getEffectiveTabWarningThreshold('off')).toBe('off');
  });

  it('lets a per-student override win over the session value', () => {
    expect(getEffectiveTabWarningThreshold(5, 2)).toBe(2);
    expect(getEffectiveTabWarningThreshold(5, 'off')).toBe('off');
    expect(getEffectiveTabWarningThreshold(undefined, 7)).toBe(7);
  });
});

describe('hasReachedTabWarningThreshold', () => {
  it('triggers once the count reaches the default threshold of 3', () => {
    expect(hasReachedTabWarningThreshold(2, 3)).toBe(false);
    expect(hasReachedTabWarningThreshold(3, 3)).toBe(true);
    expect(hasReachedTabWarningThreshold(4, 3)).toBe(true);
  });

  it('respects a custom numeric threshold', () => {
    expect(hasReachedTabWarningThreshold(4, 5)).toBe(false);
    expect(hasReachedTabWarningThreshold(5, 5)).toBe(true);
  });

  it('never triggers when the threshold is off', () => {
    expect(hasReachedTabWarningThreshold(100, 'off')).toBe(false);
  });
});

describe('resolveStudentTabWarningThreshold (M17 E2 F2)', () => {
  const overridesBySourcedId = {
    'classlink:sis-1': { tabWarningThreshold: 5 as number | 'off' },
    'classlink:sis-2': {},
  };
  const targetRefKeyByStudentUid = new Map([
    ['uid-1', 'classlink:sis-1'],
    ['uid-2', 'classlink:sis-2'],
  ]);

  it("uses the matched student's override threshold", () => {
    expect(
      resolveStudentTabWarningThreshold(
        3,
        'uid-1',
        overridesBySourcedId,
        targetRefKeyByStudentUid
      )
    ).toBe(5);
  });

  it('falls back to session threshold when the matched override has no tabWarningThreshold field', () => {
    expect(
      resolveStudentTabWarningThreshold(
        3,
        'uid-2',
        overridesBySourcedId,
        targetRefKeyByStudentUid
      )
    ).toBe(3);
  });

  it('falls back to session threshold when studentUid has no target-ref-key entry', () => {
    expect(
      resolveStudentTabWarningThreshold(
        3,
        'uid-unknown',
        overridesBySourcedId,
        targetRefKeyByStudentUid
      )
    ).toBe(3);
  });

  it('falls back to the default when overridesBySourcedId/targetRefKeyByStudentUid/studentUid are absent', () => {
    expect(resolveStudentTabWarningThreshold(undefined, null, null, null)).toBe(
      DEFAULT_TAB_WARNING_THRESHOLD
    );
  });

  it("propagates a per-student 'off' override", () => {
    const overrides = {
      'classlink:sis-1': { tabWarningThreshold: 'off' as const },
    };
    expect(
      resolveStudentTabWarningThreshold(
        3,
        'uid-1',
        overrides,
        targetRefKeyByStudentUid
      )
    ).toBe('off');
  });
});
