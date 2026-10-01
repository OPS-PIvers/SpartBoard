import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { HttpsError };
});

import { assertViewAsAllowed, readViewAsClaim } from './viewAsGuard';

const NOW = 1_000_000;
const req = (viewAs?: unknown) => ({
  auth: { uid: 'u', token: viewAs === undefined ? {} : { viewAs } },
});
const claim = (over: Record<string, unknown> = {}) => ({
  by: 'boss@x',
  sid: 's1',
  ro: true,
  adminTarget: false,
  exp: NOW + 1000,
  ...over,
});

describe('assertViewAsAllowed', () => {
  it('lets an ordinary token through untouched', () => {
    expect(assertViewAsAllowed(req(), {}, NOW)).toBeNull();
    expect(assertViewAsAllowed({ auth: null }, {}, NOW)).toBeNull();
  });

  it('lets a live read-only claim run a read callable', () => {
    expect(assertViewAsAllowed(req(claim()), { read: true }, NOW)?.sid).toBe(
      's1'
    );
  });

  it('refuses writes and outward actions while read-only', () => {
    expect(() => assertViewAsAllowed(req(claim()), {}, NOW)).toThrow(
      'Unlock edits'
    );
    expect(() =>
      assertViewAsAllowed(req(claim()), { outward: true, read: true }, NOW)
    ).toThrow('Unlock edits');
  });

  it('allows writes once unlocked', () => {
    expect(
      assertViewAsAllowed(req(claim({ ro: false })), { outward: true }, NOW)
    ).not.toBeNull();
  });

  it('refuses everything after exp, even reads', () => {
    const expired = req(claim({ ro: false, exp: NOW }));
    expect(() => assertViewAsAllowed(expired, { read: true }, NOW)).toThrow(
      'ended'
    );
  });

  it('reads a malformed claim as expired and read-only', () => {
    expect(readViewAsClaim(req('junk'))).toMatchObject({ ro: true, exp: 0 });
    expect(() => assertViewAsAllowed(req({}), { read: true }, NOW)).toThrow();
  });
});
