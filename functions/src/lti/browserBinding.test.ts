import { describe, it, expect } from 'vitest';
import {
  readBindingCookie,
  checkBinding,
  hashBindingId,
  restartPageHtml,
  parseLaunchBindingMode,
} from './browserBinding';

const ID = 'a'.repeat(43);

describe('browser binding cookie', () => {
  it('reads only a well-formed __session value', () => {
    expect(readBindingCookie(`foo=1; __session=${ID}; bar=2`)).toBe(ID);
    expect(readBindingCookie('__session=short')).toBeNull();
    expect(readBindingCookie('__session=<script>' + ID)).toBeNull();
    expect(readBindingCookie(`x__session=${ID}`)).toBeNull();
    expect(readBindingCookie(undefined)).toBeNull();
  });

  it('matches the stored hash and nothing else', () => {
    const h = hashBindingId(ID);
    expect(checkBinding(h, `__session=${ID}`)).toBe('ok');
    expect(checkBinding(h, `__session=${'b'.repeat(43)}`)).toBe('mismatch');
    expect(checkBinding(h, undefined)).toBe('missing');
    expect(checkBinding(null, undefined)).toBe('legacy');
  });

  it('escapes the restart link', () => {
    expect(restartPageHtml('/lti/login?a="><x>&b=1')).toContain(
      'href="/lti/login?a=&quot;&gt;&lt;x&gt;&amp;b=1"'
    );
  });

  it('defaults to monitor mode', () => {
    expect(parseLaunchBindingMode(undefined)).toBe('monitor');
    expect(parseLaunchBindingMode('enforce')).toBe('enforce');
    expect(parseLaunchBindingMode('ENFORCE')).toBe('monitor');
  });
});
