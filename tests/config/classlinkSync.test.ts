import { describe, expect, it } from 'vitest';
import { normalizeClassLinkSyncSettings } from '@/config/classlinkSync';
import { ROLLOUT_SWITCHES } from '@/config/rolloutSwitches';

describe('normalizeClassLinkSyncSettings', () => {
  it('is on for a missing or malformed doc', () => {
    expect(normalizeClassLinkSyncSettings(undefined).enabled).toBe(true);
    expect(normalizeClassLinkSyncSettings({}).enabled).toBe(true);
    expect(normalizeClassLinkSyncSettings({ enabled: 'false' }).enabled).toBe(
      true
    );
  });

  it('is off only for a literal false', () => {
    expect(normalizeClassLinkSyncSettings({ enabled: false }).enabled).toBe(
      false
    );
  });

  it('has a super-admin toggle on the doc the job reads', () => {
    const sw = ROLLOUT_SWITCHES.find((s) => s.docId === 'classlink_sync');
    expect(sw?.superAdminOnly).toBe(true);
  });
});
