import { describe, expect, it } from 'vitest';
import {
  normalizeClassTargetsEnforceSettings,
  normalizeVerifiedClassesFillSettings,
} from '@/config/verifiedClassesFill';
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

describe('normalizeClassTargetsEnforceSettings', () => {
  it('reads only a literal true enforce field', () => {
    expect(normalizeClassTargetsEnforceSettings(undefined).enabled).toBe(false);
    expect(
      normalizeClassTargetsEnforceSettings({ enabled: true }).enabled
    ).toBe(false);
    expect(
      normalizeClassTargetsEnforceSettings({ enforce: 'true' }).enabled
    ).toBe(false);
    expect(
      normalizeClassTargetsEnforceSettings({ enforce: true }).enabled
    ).toBe(true);
  });

  it('is a super-admin toggle on the field the rules read', () => {
    const sw = ROLLOUT_SWITCHES.find(
      (s) => s.docId === 'verified_classes_fill' && s.field === 'enforce'
    );
    expect(sw?.superAdminOnly).toBe(true);
  });
});
