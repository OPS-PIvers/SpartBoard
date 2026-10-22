import { describe, expect, it } from 'vitest';
import { matchesUrlPattern, startUrlFromPattern } from './urlPattern';

describe('matchesUrlPattern', () => {
  it('matches origin and path, ignoring a trailing slash and unlisted query keys', () => {
    const p = 'https://orono.schoology.com/course/*/materials';
    expect(
      matchesUrlPattern(p, 'https://orono.schoology.com/course/123/materials')
    ).toBe(true);
    expect(
      matchesUrlPattern(
        p,
        'https://orono.schoology.com/course/123/materials/?f=1'
      )
    ).toBe(true);
  });

  it('keeps a wildcard inside one path segment', () => {
    const p = 'https://orono.schoology.com/course/*/materials';
    expect(
      matchesUrlPattern(p, 'https://orono.schoology.com/course/1/2/materials')
    ).toBe(false);
  });

  it('rejects another origin, including a lookalike host and http', () => {
    const p = 'https://classroom.google.com/c/*';
    expect(
      matchesUrlPattern(p, 'https://classroom.google.com.evil.example/c/1')
    ).toBe(false);
    expect(matchesUrlPattern(p, 'http://classroom.google.com/c/1')).toBe(false);
  });

  it('requires query keys the pattern lists', () => {
    const p = 'https://campus.example.org/campus/portal?personID=*&mode=grades';
    expect(
      matchesUrlPattern(
        p,
        'https://campus.example.org/campus/portal?mode=grades&personID=9'
      )
    ).toBe(true);
    expect(
      matchesUrlPattern(
        p,
        'https://campus.example.org/campus/portal?personID=9'
      )
    ).toBe(false);
  });

  it('matches a hash route only when the pattern has one', () => {
    expect(
      matchesUrlPattern(
        'https://a.example/app#/home',
        'https://a.example/app#/home'
      )
    ).toBe(true);
    expect(
      matchesUrlPattern(
        'https://a.example/app#/home',
        'https://a.example/app#/other'
      )
    ).toBe(false);
    expect(
      matchesUrlPattern('https://a.example/app', 'https://a.example/app#/other')
    ).toBe(true);
  });

  it('treats regex characters in the pattern literally', () => {
    expect(
      matchesUrlPattern('https://a.example/a.b', 'https://a.example/axb')
    ).toBe(false);
  });

  it('returns false for garbage', () => {
    expect(matchesUrlPattern('not a url', 'https://a.example/')).toBe(false);
    expect(matchesUrlPattern('https://a.example/', 'nope')).toBe(false);
  });
});

describe('startUrlFromPattern', () => {
  it('opens only a concrete https address', () => {
    expect(startUrlFromPattern('https://a.example/x')).toBe(
      'https://a.example/x'
    );
    expect(startUrlFromPattern('https://a.example/*/x')).toBeNull();
    expect(startUrlFromPattern('javascript:alert(1)')).toBeNull();
    expect(startUrlFromPattern('http://a.example/')).toBeNull();
  });
});
