import { describe, it, expect } from 'vitest';
import {
  clampTabAwaySeconds,
  formatAwayDuration,
  getEffectiveTabAwayRule,
  tabAwaySessionFields,
} from '@/utils/tabAwayLimit';

describe('getEffectiveTabAwayRule', () => {
  it('is null for a session assigned without the flag', () => {
    expect(getEffectiveTabAwayRule({}, 60)).toBeNull();
  });

  it('uses the session limit and auto-submit setting', () => {
    expect(
      getEffectiveTabAwayRule({
        tabAwayLimitSeconds: 30,
        tabAwayAutoSubmit: true,
      })
    ).toEqual({ limitMs: 30_000, autoSubmit: true });
    expect(getEffectiveTabAwayRule({ tabAwayLimitSeconds: 30 })).toEqual({
      limitMs: 30_000,
      autoSubmit: false,
    });
  });

  it('lets a student override win, with seconds meaning auto-submit', () => {
    expect(getEffectiveTabAwayRule({ tabAwayLimitSeconds: 30 }, 120)).toEqual({
      limitMs: 120_000,
      autoSubmit: true,
    });
    expect(
      getEffectiveTabAwayRule(
        { tabAwayLimitSeconds: 30, tabAwayAutoSubmit: true },
        'off'
      )
    ).toEqual({ limitMs: 30_000, autoSubmit: false });
  });
});

describe('tabAwaySessionFields', () => {
  it('stamps nothing without the flag', () => {
    expect(tabAwaySessionFields(false, { tabAwayAutoSubmit: true })).toEqual(
      {}
    );
  });

  it('stamps the 30 s default and clamps a chosen limit', () => {
    expect(tabAwaySessionFields(true, {})).toEqual({
      tabAwayLimitSeconds: 30,
      tabAwayAutoSubmit: false,
    });
    expect(
      tabAwaySessionFields(true, {
        tabAwayLimitSeconds: 900,
        tabAwayAutoSubmit: true,
      })
    ).toEqual({ tabAwayLimitSeconds: 300, tabAwayAutoSubmit: true });
  });
});

describe('clampTabAwaySeconds', () => {
  it('keeps 5 s to 5 min', () => {
    expect(clampTabAwaySeconds(1)).toBe(5);
    expect(clampTabAwaySeconds(45)).toBe(45);
    expect(clampTabAwaySeconds(301)).toBe(300);
    expect(clampTabAwaySeconds(Number.NaN)).toBe(30);
  });
});

describe('formatAwayDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatAwayDuration(7_400)).toBe('0:07');
    expect(formatAwayDuration(72_000)).toBe('1:12');
    expect(formatAwayDuration(842_000)).toBe('14:02');
    expect(formatAwayDuration(-5)).toBe('0:00');
  });
});
