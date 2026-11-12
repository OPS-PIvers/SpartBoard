import { describe, expect, it } from 'vitest';
import { describeBrowser, profileState } from './quizEnvironment';

describe('describeBrowser', () => {
  it('names common browsers and systems', () => {
    expect(
      describeBrowser(
        'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      )
    ).toBe('Chrome 141, ChromeOS');
    expect(
      describeBrowser(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
      )
    ).toBe('Edge 140, Windows');
    expect(
      describeBrowser(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
      )
    ).toBe('Firefox 131, Windows');
    expect(
      describeBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
      )
    ).toBe('Safari 18, macOS');
    expect(describeBrowser('something else')).toBe(
      'Unknown browser, unknown system'
    );
  });

  it('tells an iPad asking for desktop sites from a Mac', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
    expect(describeBrowser(ua, 5)).toBe('Safari 18, iPad');
  });
});

describe('profileState', () => {
  const ready = (over: object) =>
    ({
      kind: 'ready',
      protocol: 13,
      version: '0.1.35',
      profile: 'staff',
      ...over,
    }) as const;

  it('is managed only for a policy install in a district profile', () => {
    expect(profileState(ready({ install: 'policy' }), false)).toBe('managed');
    expect(profileState(ready({ install: 'user' }), false)).toBe('unmanaged');
    expect(profileState(ready({ install: 'dev' }), false)).toBe('unmanaged');
    expect(
      profileState(ready({ install: 'policy', profile: 'other' }), false)
    ).toBe('unmanaged');
  });

  it('never guesses for an embedded page or an older extension', () => {
    expect(profileState({ kind: 'none' }, true)).toBe('embedded');
    expect(profileState(ready({ protocol: 12 }), false)).toBe('unknown');
    expect(profileState(ready({}), false)).toBe('unknown');
    expect(profileState({ kind: 'none' }, false)).toBe('no-extension');
  });
});
