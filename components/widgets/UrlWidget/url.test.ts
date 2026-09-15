import { describe, expect, it } from 'vitest';
import { normalizeUrl, toSafeLinkHref } from './url';

describe('UrlWidget url helpers', () => {
  it('prefixes scheme-less links with https', () => {
    expect(normalizeUrl(' example.com ')).toBe('https://example.com');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('opens http(s) links, including un-normalized ones', () => {
    expect(toSafeLinkHref('example.com/page')).toBe('https://example.com/page');
    expect(toSafeLinkHref('HTTP://example.com')).toBe('HTTP://example.com');
  });

  it('refuses empty and non-http schemes', () => {
    expect(toSafeLinkHref('')).toBeNull();
    expect(toSafeLinkHref(undefined)).toBeNull();
    expect(toSafeLinkHref('javascript:alert(1)')).toBeNull();
    expect(toSafeLinkHref('data:text/html,<script>1</script>')).toBeNull();
  });
});
