import { describe, expect, it } from 'vitest';
import { BLUR_DEFAULTS, isBlurSettings, toBlurSettings } from './blurSettings';

describe('blur settings', () => {
  it('starts with table rows and images off and the rest on', () => {
    expect(BLUR_DEFAULTS).toEqual({
      emails: true,
      ids: true,
      lastFirst: true,
      fields: true,
      tableRows: false,
      images: false,
    });
  });

  it('fills missing or malformed stored values with defaults', () => {
    expect(toBlurSettings(undefined)).toEqual(BLUR_DEFAULTS);
    expect(toBlurSettings({ emails: false, images: 'yes', extra: 1 })).toEqual({
      ...BLUR_DEFAULTS,
      emails: false,
    });
  });

  it('accepts only complete settings in a message', () => {
    expect(isBlurSettings(BLUR_DEFAULTS)).toBe(true);
    expect(isBlurSettings({ emails: true })).toBe(false);
    expect(isBlurSettings(null)).toBe(false);
  });
});
