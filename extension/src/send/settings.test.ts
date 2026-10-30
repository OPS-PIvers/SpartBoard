import { describe, expect, it } from 'vitest';
import {
  buttonShown,
  DEFAULT_SEND_SETTINGS,
  parseSendSettings,
  siteOf,
  withHidden,
} from './settings';

describe('send settings', () => {
  it('defaults to showing the button everywhere', () => {
    expect(parseSendSettings(undefined)).toEqual(DEFAULT_SEND_SETTINGS);
    expect(parseSendSettings({ hiddenHosts: [1, 'a.org'] })).toEqual({
      showOnPages: true,
      hiddenHosts: ['a.org'],
    });
  });

  it('hides per site and globally', () => {
    const hidden = withHidden(DEFAULT_SEND_SETTINGS, 'a.org', true);
    expect(buttonShown(hidden, 'https://a.org/x')).toBe(false);
    expect(buttonShown(hidden, 'https://b.org/x')).toBe(true);
    expect(
      buttonShown(withHidden(hidden, 'a.org', false), 'https://a.org/')
    ).toBe(true);
    expect(
      buttonShown(
        { ...DEFAULT_SEND_SETTINGS, showOnPages: false },
        'https://b.org/'
      )
    ).toBe(false);
  });

  it('only gives web pages a site', () => {
    expect(siteOf('https://A.org/x')).toBe('a.org');
    expect(siteOf('chrome://extensions')).toBeNull();
    expect(siteOf('not a url')).toBeNull();
  });
});
