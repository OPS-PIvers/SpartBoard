import { describe, it, expect } from 'vitest';
import { FEATURE_DEFAULTS } from './featureDefaults';

describe('FEATURE_DEFAULTS', () => {
  it('declares an anonymous-join entry that is default-public', () => {
    // Phase 3b: the no-sign-in join link must stay available to every
    // teacher until an admin restricts it, so the missing-doc default is
    // public (docs/wide-distro-plan.md).
    const entry = FEATURE_DEFAULTS['anonymous-join'];
    expect(entry).toBeDefined();
    expect(entry.defaultAccessLevel).toBe('public');
    expect(entry.defaultEnabled).toBe(true);
    expect(entry.missingDocPublic).toBe(true);
  });

  it('declares a settings-drawer entry that is admin-only and default-off for missing docs', () => {
    // Wave 1b alpha rollout: admin-only, but the missing-doc gate stays
    // fail-closed until an admin opts in (flipped in wave 4).
    const entry = FEATURE_DEFAULTS['settings-drawer'];
    expect(entry).toBeDefined();
    expect(entry.defaultAccessLevel).toBe('admin');
    expect(entry.defaultEnabled).toBe(true);
    expect(entry.missingDocPublic).toBe(false);
    expect(entry.defaultMinTier).toBeUndefined();
  });

  it('declares a quiz-read-aloud entry that is admin-only and fail-closed for missing docs', () => {
    const entry = FEATURE_DEFAULTS['quiz-read-aloud'];
    expect(entry).toBeDefined();
    expect(entry.defaultAccessLevel).toBe('admin');
    expect(entry.defaultEnabled).toBe(true);
    expect(entry.missingDocPublic).toBe(false);
    expect(entry.defaultMinTier).toBeUndefined();
  });

  it('declares a quiz-translation entry that is admin-only and fail-closed for missing docs', () => {
    const entry = FEATURE_DEFAULTS['quiz-translation'];
    expect(entry).toBeDefined();
    expect(entry.defaultAccessLevel).toBe('admin');
    expect(entry.defaultEnabled).toBe(true);
    expect(entry.missingDocPublic).toBe(false);
    expect(entry.defaultMinTier).toBeUndefined();
  });
});
