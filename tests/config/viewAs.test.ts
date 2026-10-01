import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_AS_SETTINGS,
  normalizeViewAsSettings,
} from '@/config/viewAs';

describe('normalizeViewAsSettings', () => {
  it('reads a missing doc as off', () => {
    expect(normalizeViewAsSettings(undefined)).toEqual(
      DEFAULT_VIEW_AS_SETTINGS
    );
    expect(DEFAULT_VIEW_AS_SETTINGS.enabled).toBe(false);
  });

  it('only a literal true turns it on', () => {
    expect(normalizeViewAsSettings({ enabled: true })).toEqual({
      enabled: true,
    });
    for (const raw of [{ enabled: 'true' }, { enabled: 1 }, {}, 'on', null]) {
      expect(normalizeViewAsSettings(raw).enabled).toBe(false);
    }
  });
});
