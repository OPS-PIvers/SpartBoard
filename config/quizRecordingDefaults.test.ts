import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RECORDING_CONFIG,
  normalizeRecordingConfig,
  takesRemaining,
  wrapUpThresholdSeconds,
} from './quizRecordingDefaults';

describe('normalizeRecordingConfig', () => {
  it('returns undefined for an absent block so legacy questions stay legacy', () => {
    expect(normalizeRecordingConfig(undefined)).toBeUndefined();
    expect(normalizeRecordingConfig(null)).toBeUndefined();
  });

  it('defaults to 30s prep, 60s limit and unlimited takes', () => {
    expect(normalizeRecordingConfig({})).toEqual({
      prepSeconds: 30,
      limitSeconds: 60,
      prepExpiry: 'armed',
      takeLimit: null,
    });
    expect(DEFAULT_RECORDING_CONFIG.takeLimit).toBeNull();
  });

  it('clamps the audio limit to 300 seconds', () => {
    expect(normalizeRecordingConfig({ limitSeconds: 9000 })?.limitSeconds).toBe(
      300
    );
  });

  it('rejects an unknown prepExpiry rather than passing it through', () => {
    expect(
      normalizeRecordingConfig({
        prepExpiry: 'nonsense' as never,
      })?.prepExpiry
    ).toBe('armed');
  });

  it('tolerates the authoring-only stash and drops it from the result', () => {
    const normalized = normalizeRecordingConfig({
      ...DEFAULT_RECORDING_CONFIG,
      priorTimeLimit: 45,
    });
    expect(normalized).toEqual(DEFAULT_RECORDING_CONFIG);
    expect(normalized && 'priorTimeLimit' in normalized).toBe(false);
  });

  it('treats a non-numeric takeLimit as unlimited', () => {
    expect(normalizeRecordingConfig({ takeLimit: 0 })?.takeLimit).toBe(1);
    expect(
      normalizeRecordingConfig({ takeLimit: undefined })?.takeLimit
    ).toBeNull();
  });
});

describe('takesRemaining', () => {
  it('is null when unlimited and never negative when limited', () => {
    const base = DEFAULT_RECORDING_CONFIG;
    expect(takesRemaining(base, 5)).toBeNull();
    expect(takesRemaining({ ...base, takeLimit: 2 }, 0)).toBe(2);
    expect(takesRemaining({ ...base, takeLimit: 2 }, 5)).toBe(0);
  });
});

describe('wrapUpThresholdSeconds', () => {
  it('opens the wrap-up stretch before the limit, never after it', () => {
    expect(wrapUpThresholdSeconds(60)).toBe(6);
    expect(wrapUpThresholdSeconds(300)).toBe(30);
    // Short takes still get a warning rather than a silent cut-off.
    expect(wrapUpThresholdSeconds(10)).toBe(5);
  });
});
