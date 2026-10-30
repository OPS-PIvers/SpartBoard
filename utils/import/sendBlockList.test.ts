import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEND_BLOCK_PATTERNS,
  isUrlBlocked,
  isValidBlockPattern,
  normalizeBlockPattern,
  resolveBlockPatterns,
} from './sendBlockList';

const blocked = (url: string, patterns = DEFAULT_SEND_BLOCK_PATTERNS) =>
  isUrlBlocked(url, patterns);

describe('normalizeBlockPattern', () => {
  it.each([
    ['HTTPS://Campus.Example.org/', 'campus.example.org'],
    [
      '*.schoology.com/course/*/gradebook*',
      '*.schoology.com/course/*/gradebook*',
    ],
    ['  example.org/a/b ', 'example.org/a/b'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizeBlockPattern(raw)).toBe(expected);
  });

  it.each([
    '',
    '*',
    '*.com',
    'localhost',
    'exa mple.org',
    'example.org/a b',
    'example.org/**',
    'ftp://x.org',
    `a.org/${'x'.repeat(400)}`,
  ])('refuses %j', (raw) => {
    expect(isValidBlockPattern(raw)).toBe(false);
  });
});

describe('isUrlBlocked', () => {
  it('blocks the default student-data pages', () => {
    expect(blocked('https://orono.schoology.com/course/123/gradebook')).toBe(
      true
    );
    expect(blocked('https://orono.schoology.com/course/123/members?x=1')).toBe(
      true
    );
    expect(
      blocked('https://orono.schoology.com/assignment/9/dropbox/view')
    ).toBe(true);
    expect(
      blocked('https://orono.schoology.com/assignment/9/assessment_submissions')
    ).toBe(true);
    expect(blocked('https://mncampus.infinitecampus.org/campus/portal')).toBe(
      true
    );
    expect(blocked('https://infinitecampus.org/')).toBe(true);
  });

  it('allows ordinary pages', () => {
    expect(blocked('https://orono.schoology.com/course/123/materials')).toBe(
      false
    );
    expect(blocked('https://orono.schoology.com/assignment/9')).toBe(false);
    expect(blocked('https://en.wikipedia.org/wiki/Water_cycle')).toBe(false);
  });

  it('matches hosts exactly, not by suffix text', () => {
    expect(blocked('https://notinfinitecampus.org/')).toBe(false);
    expect(blocked('https://infinitecampus.org.evil.example/')).toBe(false);
    expect(isUrlBlocked('https://a.example.org/', ['example.org'])).toBe(false);
    expect(isUrlBlocked('https://example.org./x', ['example.org'])).toBe(true);
  });

  it('matches the whole path, ignoring case, query and hash', () => {
    expect(isUrlBlocked('https://x.org/a/B?q=1#h', ['x.org/a/b'])).toBe(true);
    expect(isUrlBlocked('https://x.org/a/b/c', ['x.org/a/b'])).toBe(false);
    expect(isUrlBlocked('https://x.org/a/b/c', ['x.org/a/b*'])).toBe(true);
  });

  it('sees through encoded and padded paths', () => {
    for (const url of [
      'https://x.schoology.com/course/1/gr%61debook',
      'https://x.schoology.com/%67rades/grades',
      'https://x.schoology.com/course/1/gr%2561debook',
      'https://x.schoology.com/course/1;x=1/gradebook',
      'https://x.schoology.com//course/1/members',
      'https://x.schoology.com/course/1/%E0%A4%A/gradebook',
    ])
      expect(blocked(url)).toBe(true);
  });

  it('treats unreadable and non-web URLs as blocked', () => {
    expect(blocked('not a url')).toBe(true);
    expect(blocked('chrome://settings')).toBe(true);
    expect(blocked('file:///C:/grades.pdf')).toBe(true);
  });

  it('matches a star-heavy pattern in linear time', () => {
    const started = Date.now();
    expect(
      isUrlBlocked(`https://x.org/${'a'.repeat(2000)}`, [
        `x.org/${'*a'.repeat(100)}*b`,
      ])
    ).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('blocks a root dropbox and a host with trailing dots', () => {
    expect(blocked('https://orono.schoology.com/dropbox')).toBe(true);
    expect(blocked('https://orono.schoology.com../course/1/gradebook')).toBe(
      true
    );
  });

  it('ignores an invalid saved pattern instead of blocking everything', () => {
    expect(isUrlBlocked('https://x.org/', ['*'])).toBe(false);
  });
});

describe('resolveBlockPatterns', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(resolveBlockPatterns(undefined)).toEqual(
      DEFAULT_SEND_BLOCK_PATTERNS
    );
    expect(resolveBlockPatterns({})).toEqual(DEFAULT_SEND_BLOCK_PATTERNS);
  });

  it("keeps the admin's valid patterns, even an empty list", () => {
    expect(resolveBlockPatterns({ patterns: ['X.org', '*', 3] })).toEqual([
      'x.org',
    ]);
    expect(resolveBlockPatterns({ patterns: [] })).toEqual([]);
  });
});
