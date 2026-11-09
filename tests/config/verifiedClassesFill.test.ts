import { describe, expect, it } from 'vitest';
import { normalizeVerifiedClassesFillSettings } from '@/config/verifiedClassesFill';
import { ROLLOUT_SWITCHES } from '@/config/rolloutSwitches';

describe('normalizeVerifiedClassesFillSettings', () => {
  it('is off for a missing or malformed doc', () => {
    expect(normalizeVerifiedClassesFillSettings(undefined).enabled).toBe(false);
    expect(normalizeVerifiedClassesFillSettings('true').enabled).toBe(false);
    expect(normalizeVerifiedClassesFillSettings({}).enabled).toBe(false);
  });

  it('is on only for a literal true', () => {
    expect(
      normalizeVerifiedClassesFillSettings({ enabled: 'true' }).enabled
    ).toBe(false);
    expect(
      normalizeVerifiedClassesFillSettings({ enabled: true }).enabled
    ).toBe(true);
  });

  it('has a toggle on the doc the job reads', () => {
    expect(
      ROLLOUT_SWITCHES.some((s) => s.docId === 'verified_classes_fill')
    ).toBe(true);
  });
});
