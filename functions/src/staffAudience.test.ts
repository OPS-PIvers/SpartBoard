import { describe, expect, it } from 'vitest';
import { staffIdentityFromToken } from './staffAudience';

const token = {
  email: 'Pat.Teacher@orono.k12.mn.us',
  email_verified: true,
  name: 'Pat Teacher',
};

describe('staffIdentityFromToken', () => {
  it('reads a verified district account', () => {
    expect(staffIdentityFromToken(token)).toEqual({
      staffEmail: 'pat.teacher@orono.k12.mn.us',
      staffName: 'Pat Teacher',
    });
  });

  it.each([
    ['no token', null],
    ['an unverified email', { ...token, email_verified: false }],
    ['a student token', { ...token, studentRole: true }],
    ['a PIN token', { ...token, pinLogin: true }],
    ['another domain', { ...token, email: 'pat@gmail.com' }],
    [
      'a look-alike domain',
      { ...token, email: 'pat@orono.k12.mn.us.evil.com' },
    ],
  ])('refuses %s', (_label, raw) => {
    expect(staffIdentityFromToken(raw)).toBeNull();
  });
});
