import { describe, expect, it } from 'vitest';
import {
  isOpenableUrl,
  parseExtensionMessage,
  profileFromEmail,
} from './extensionProtocol';

describe('parseExtensionMessage', () => {
  it('accepts ping with no other keys', () => {
    expect(parseExtensionMessage({ type: 'ping' })).toEqual({
      kind: 'ok',
      message: { type: 'ping' },
      staffOnly: false,
    });
  });

  it('marks unknown types unsupported so newer pages degrade (D6)', () => {
    expect(parseExtensionMessage({ type: 'focus/start' })).toEqual({
      kind: 'unsupported',
    });
    expect(parseExtensionMessage({ type: 'toString' })).toEqual({
      kind: 'unsupported',
    });
    expect(parseExtensionMessage({ type: '__proto__' })).toEqual({
      kind: 'unsupported',
    });
  });

  it.each([
    ['a string', 'ping'],
    ['null', null],
    ['an array', [{ type: 'ping' }]],
    ['a missing type', {}],
    ['a non-string type', { type: 1 }],
    ['an extra key', { type: 'ping', url: 'https://example.com' }],
    ['a class instance', Object.assign(new (class Msg {})(), { type: 'ping' })],
  ])('refuses %s', (_, raw) => {
    expect(parseExtensionMessage(raw)).toEqual({ kind: 'invalid' });
  });
});

describe('isOpenableUrl', () => {
  it('accepts plain https URLs', () => {
    expect(isOpenableUrl('https://app.schoology.com/home')).toBe(true);
  });

  it.each([
    'http://app.schoology.com/',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'chrome://settings',
    'file:///etc/passwd',
    'https://user:pass@example.com/',
    '/relative/path',
    `https://example.com/${'a'.repeat(2048)}`,
    '',
  ])('refuses %s', (url) => {
    expect(isOpenableUrl(url)).toBe(false);
  });

  it('refuses non-strings', () => {
    expect(isOpenableUrl(undefined)).toBe(false);
    expect(isOpenableUrl({ href: 'https://example.com' })).toBe(false);
  });
});

describe('profileFromEmail', () => {
  it('treats only the staff domain as staff', () => {
    expect(profileFromEmail('Teacher@Orono.K12.MN.US')).toBe('staff');
    expect(profileFromEmail('kid@students.orono.k12.mn.us')).toBe('other');
    expect(profileFromEmail('x@orono.k12.mn.us.evil.example')).toBe('other');
    expect(profileFromEmail('x@evilorono.k12.mn.us')).toBe('other');
    expect(profileFromEmail('someone@gmail.com')).toBe('other');
  });

  it('reports no signed-in profile for an empty email (R2-6)', () => {
    expect(profileFromEmail('')).toBe('none');
    expect(profileFromEmail(undefined)).toBe('none');
  });
});
