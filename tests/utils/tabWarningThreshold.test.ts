import { describe, it, expect } from 'vitest';
import {
  getEffectiveTabWarningThreshold,
  hasReachedTabWarningThreshold,
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
