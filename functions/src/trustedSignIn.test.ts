// Which SpartBoard account an extension's Google-verified address maps to.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({ auth: vi.fn() }));

import * as firebaseAdmin from './firebaseAdmin';
import {
  trustedSignInUid,
  trustedUidForEmail,
  trustedUserForEmail,
} from './trustedSignIn';

const EMAIL = 'teacher@orono.k12.mn.us';
const google = [{ providerId: 'google.com', email: EMAIL }];
const lookup = (user: object | Error) =>
  vi.mocked(firebaseAdmin.auth).mockReturnValue({
    getUserByEmail: () =>
      user instanceof Error ? Promise.reject(user) : Promise.resolve(user),
  } as never);
const notFound = Object.assign(new Error('missing'), {
  code: 'auth/user-not-found',
});
const untrusted = [
  {
    uid: 'x',
    emailVerified: true,
    providerData: [{ providerId: 'password', email: EMAIL }],
  },
  { uid: 'x', emailVerified: false, providerData: google },
  { uid: 'x', emailVerified: true, disabled: true, providerData: google },
  {
    uid: 'x',
    emailVerified: true,
    providerData: [{ providerId: 'google.com', email: 'x@gmail.com' }],
  },
];

describe('trustedSignInUid', () => {
  it('returns the uid of a verified Google account for the address', () => {
    const user = { uid: 'uid-1', emailVerified: true, providerData: google };
    expect(trustedSignInUid(user, 'Teacher@orono.k12.mn.us')).toBe('uid-1');
  });

  it('answers no account for password-only, unverified, disabled or other-address accounts', () => {
    for (const user of untrusted)
      expect(trustedSignInUid(user, EMAIL)).toBeNull();
  });
});

describe('trustedUidForEmail', () => {
  it('returns the uid only for an enabled, verified Google account at that address', async () => {
    lookup({ uid: 'u1', emailVerified: true, providerData: google });
    expect(await trustedUidForEmail(EMAIL)).toBe('u1');
  });

  it('ignores untrusted, missing and failed lookups', async () => {
    for (const user of [...untrusted, notFound, new Error('down')]) {
      lookup(user);
      expect(await trustedUidForEmail(EMAIL)).toBeNull();
    }
  });
});

describe('trustedUserForEmail', () => {
  it('is null for untrusted and missing accounts', async () => {
    for (const user of [...untrusted, notFound]) {
      lookup(user);
      expect(await trustedUserForEmail(EMAIL)).toBeNull();
    }
  });

  it('rethrows other Auth errors', async () => {
    lookup(new Error('down'));
    await expect(trustedUserForEmail(EMAIL)).rejects.toThrow('down');
  });
});
