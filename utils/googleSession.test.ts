import { describe, it, expect } from 'vitest';
import { isGoogleSession } from './googleSession';

describe('isGoogleSession', () => {
  it('is true for a Google-provider user', () => {
    expect(
      isGoogleSession({ providerData: [{ providerId: 'google.com' }] })
    ).toBe(true);
  });

  it('is true when google.com is one of several providers', () => {
    expect(
      isGoogleSession({
        providerData: [
          { providerId: 'password' },
          { providerId: 'google.com' },
        ],
      })
    ).toBe(true);
  });

  // The bug: a leftover studentRole custom-token session in a partitioned LTI
  // iframe has an empty providerData but is still a "user". The picker used to
  // treat it as signed in → skipped the Google sign-in card and listed the
  // wrong uid's (empty) quiz library.
  it('is false for a custom-token / studentRole session (empty providerData)', () => {
    expect(isGoogleSession({ providerData: [] })).toBe(false);
  });

  it('is false for an anonymous session (empty providerData)', () => {
    expect(isGoogleSession({ providerData: [] })).toBe(false);
  });

  it('is false when only a non-Google provider is present', () => {
    expect(
      isGoogleSession({ providerData: [{ providerId: 'password' }] })
    ).toBe(false);
  });

  it('is false for null / undefined / missing providerData', () => {
    expect(isGoogleSession(null)).toBe(false);
    expect(isGoogleSession(undefined)).toBe(false);
    expect(isGoogleSession({})).toBe(false);
  });
});
