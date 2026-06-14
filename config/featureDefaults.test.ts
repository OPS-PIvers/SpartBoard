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
});
