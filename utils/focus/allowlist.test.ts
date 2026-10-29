import { describe, expect, it } from 'vitest';
import {
  canonicalFocusPath,
  isFocusSite,
  matchFocusUrl,
  normalizeFocusSites,
  parseFocusSite,
} from './allowlist';
import { FOCUS_MAX_SITES } from './contract';

describe('parseFocusSite', () => {
  it.each([
    ['desmos.com', { host: 'desmos.com', path: '' }],
    ['  Desmos.COM  ', { host: 'desmos.com', path: '' }],
    [
      'https://www.desmos.com/calculator/',
      { host: 'desmos.com', path: '/calculator' },
    ],
    ['*.khanacademy.org', { host: 'khanacademy.org', path: '' }],
    [
      'http://example.org:8080/a/b?x=1#y',
      { host: 'example.org', path: '/a/b' },
    ],
    ['desmos.com.', { host: 'desmos.com', path: '' }],
    ['desmos.com:8080/calculator', { host: 'desmos.com', path: '/calculator' }],
    [
      'https://docs.google.com/document/d/e/2PACX-AAA/pub',
      { host: 'docs.google.com', path: '/document/d/e/2PACX-AAA' },
    ],
    [
      'https://docs.google.com/document/u/1/d/abc123/edit?usp=sharing',
      { host: 'docs.google.com', path: '/document/d/abc123' },
    ],
    [
      'https://docs.google.com/forms/d/e/1FAIpQ/viewform',
      { host: 'docs.google.com', path: '/forms/d/e/1FAIpQ' },
    ],
    [
      'drive.google.com/file/d/xyz/view',
      { host: 'drive.google.com', path: '/file/d/xyz' },
    ],
    [
      'https://classroom.google.com/u/0/c/NjQ1',
      { host: 'classroom.google.com', path: '/c/NjQ1' },
    ],
  ])('parses %s', (input, expected) => {
    expect(parseFocusSite(input)).toEqual(expected);
  });

  it.each([
    '',
    'not a site',
    'localhost',
    'com',
    '127.0.0.1',
    'http://[::1]/',
    'javascript:alert(1)',
    'chrome://settings',
    'ftp://files.example.org',
    'https://user:pw@desmos.com',
    'https://-bad-.example.org',
    'https://drive.google.com/open?id=ABC',
    'drive.google.com/uc?id=ABC&export=download',
    'https://docs.google.com/viewer?url=x',
  ])('rejects %s', (input) => {
    expect(parseFocusSite(input)).toBeNull();
  });
});

describe('canonicalFocusPath', () => {
  it('keeps /u/N on hosts that are not Google file hosts', () => {
    expect(canonicalFocusPath('example.org', '/u/1/page/')).toBe('/u/1/page');
  });

  it('treats edit, view and preview of one Google file as the same path', () => {
    for (const tail of ['edit', 'view', 'preview', 'edit#gid=0', ''])
      expect(
        canonicalFocusPath('docs.google.com', `/spreadsheets/d/S1/${tail}`)
      ).toBe('/spreadsheets/d/S1');
  });

  it('does not decode percent escapes', () => {
    expect(canonicalFocusPath('example.org', '/math%2F..%2Fother')).toBe(
      '/math%2F..%2Fother'
    );
  });
});

describe('isFocusSite and normalizeFocusSites', () => {
  it('accepts only what parseFocusSite produces', () => {
    expect(isFocusSite({ host: 'desmos.com', path: '' })).toBe(true);
    expect(isFocusSite({ host: 'www.desmos.com', path: '' })).toBe(false);
    expect(isFocusSite({ host: 'desmos.com', path: '/a/' })).toBe(false);
    expect(isFocusSite({ host: 'desmos.com', path: 'a' })).toBe(false);
    expect(isFocusSite({ host: 'evil.example/x', path: '' })).toBe(false);
    expect(isFocusSite({ host: 'desmos.com' })).toBe(false);
    expect(isFocusSite(null)).toBe(false);
    expect(isFocusSite('desmos.com')).toBe(false);
  });

  it('drops invalid and duplicate sites and caps the list', () => {
    const many = Array.from({ length: FOCUS_MAX_SITES + 5 }, (_, i) => ({
      host: `site${i}.example.org`,
      path: '',
    }));
    expect(
      normalizeFocusSites([
        { host: 'desmos.com', path: '' },
        { host: 'desmos.com', path: '' },
        { host: 'bad host', path: '' },
      ])
    ).toEqual([{ host: 'desmos.com', path: '' }]);
    expect(normalizeFocusSites(many)).toHaveLength(FOCUS_MAX_SITES);
  });
});

describe('matchFocusUrl', () => {
  const sites = [
    { host: 'desmos.com', path: '/calculator' },
    { host: 'khanacademy.org', path: '' },
    { host: 'docs.google.com', path: '/document/d/abc' },
    { host: 'docs.google.com', path: '/document/d/e/2PACX-AAA' },
    { host: 'classroom.google.com', path: '/c/NjQ1' },
  ];
  const spart = ['https://spartboard.web.app'];

  it.each([
    'https://www.desmos.com/calculator',
    'https://desmos.com/calculator/abc?lang=en',
    'https://student.desmos.com/calculator',
    'https://www.khanacademy.org/math/algebra',
    'https://docs.google.com/document/d/abc/edit',
    'https://docs.google.com/document/u/2/d/abc/preview',
    'https://docs.google.com/document/d/e/2PACX-AAA/pub',
    'https://classroom.google.com/u/3/c/NjQ1/a/xyz/details',
    'https://accounts.google.com/signin',
    'https://launchpad.classlink.com/orono',
    'https://spartboard.web.app/quiz?code=1',
  ])('allows %s', (url) => {
    expect(matchFocusUrl(url, sites, spart)).toBe('allowed');
  });

  it.each([
    'https://desmos.com.evil.example/calculator',
    'https://evildesmos.com/calculator',
    'https://desmos.com/calculatorx',
    'https://desmos.com/',
    'https://khanacademy.org.example.net/',
    'https://docs.google.com/document/d/abcd/edit',
    'https://docs.google.com/document/d/other/edit',
    'https://classroom.google.com/c/OTHER',
    'https://www.youtube.com/watch?v=1',
    'https://desmos.com@evil.example/calculator',
    'https://spartboard.web.app.evil.example/',
    'https://spartboard-dev.web.app/',
    'https://desmos.com/calculator%2F..%2Fother',
    'https://docs.google.com/document/d/e/2PACX-BBB/pub',
  ])('blocks %s', (url) => {
    expect(matchFocusUrl(url, sites, spart)).toBe('blocked');
  });

  it.each(['chrome://newtab', 'about:blank', 'file:///tmp/a.html', 'nope'])(
    'leaves %s to the engine',
    (url) => {
      expect(matchFocusUrl(url, sites, spart)).toBe('not-web');
    }
  );

  it('blocks everything but the always-allowed hosts with an empty list', () => {
    expect(matchFocusUrl('https://desmos.com/', [])).toBe('blocked');
    expect(matchFocusUrl('https://accounts.google.com/', [])).toBe('allowed');
  });
});
