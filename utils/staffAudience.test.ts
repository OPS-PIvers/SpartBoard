import { describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  audienceSessionFields,
  flashcardAssignmentUrl,
  hasStaffRows,
  isDistrictStaffEmail,
  isStaffAudience,
  readStaffIdentity,
  staffCsvCells,
  staffDisplayName,
  staffResponseFields,
  staffResultsLabel,
} from './staffAudience';

const userWith = (claims: Record<string, unknown>, isAnonymous = false) =>
  ({
    isAnonymous,
    getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
  }) as unknown as User;

const staffClaims = {
  email: 'Pat.Teacher@orono.k12.mn.us',
  email_verified: true,
  name: 'Pat Teacher',
};

describe('staff audience session fields', () => {
  it('writes audience only for staff, so student sessions are unchanged', () => {
    expect(audienceSessionFields('staff')).toEqual({ audience: 'staff' });
    expect(audienceSessionFields('students')).toEqual({});
    expect(audienceSessionFields(undefined)).toEqual({});
    expect(isStaffAudience({ audience: 'staff' })).toBe(true);
    expect(isStaffAudience({})).toBe(false);
    expect(isStaffAudience(null)).toBe(false);
  });
});

describe('isDistrictStaffEmail', () => {
  it('accepts only the district domain', () => {
    expect(isDistrictStaffEmail('a@orono.k12.mn.us')).toBe(true);
    expect(isDistrictStaffEmail('A@ORONO.K12.MN.US')).toBe(true);
    expect(isDistrictStaffEmail('a@gmail.com')).toBe(false);
    expect(isDistrictStaffEmail('a@orono.k12.mn.us.evil.com')).toBe(false);
    expect(isDistrictStaffEmail('a@xorono.k12.mn.us')).toBe(false);
    expect(isDistrictStaffEmail(null)).toBe(false);
  });
});

describe('readStaffIdentity', () => {
  it('reads a verified district account, lowercasing the email', async () => {
    await expect(readStaffIdentity(userWith(staffClaims))).resolves.toEqual({
      staffEmail: 'pat.teacher@orono.k12.mn.us',
      staffName: 'Pat Teacher',
    });
  });

  it('refuses anonymous, unverified, student, PIN and outside accounts', async () => {
    await expect(readStaffIdentity(null)).resolves.toBeNull();
    await expect(
      readStaffIdentity(userWith(staffClaims, true))
    ).resolves.toBeNull();
    await expect(
      readStaffIdentity(userWith({ ...staffClaims, email_verified: false }))
    ).resolves.toBeNull();
    await expect(
      readStaffIdentity(userWith({ ...staffClaims, studentRole: true }))
    ).resolves.toBeNull();
    await expect(
      readStaffIdentity(userWith({ ...staffClaims, pinLogin: true }))
    ).resolves.toBeNull();
    await expect(
      readStaffIdentity(userWith({ ...staffClaims, email: 'pat@gmail.com' }))
    ).resolves.toBeNull();
  });

  it('uses an empty name when the token has none', async () => {
    const { name: _name, ...noName } = staffClaims;
    await expect(readStaffIdentity(userWith(noName))).resolves.toEqual({
      staffEmail: 'pat.teacher@orono.k12.mn.us',
      staffName: '',
    });
  });
});

describe('staff results helpers', () => {
  const staff = { staffEmail: 'pat@orono.k12.mn.us', staffName: 'Pat T' };

  it('adds response fields only for a staff joiner', () => {
    expect(staffResponseFields(staff)).toEqual(staff);
    expect(staffResponseFields(null)).toEqual({});
  });

  it('labels a staff row with name and email, and leaves student rows alone', () => {
    expect(staffResultsLabel(staff)).toBe('Pat T (pat@orono.k12.mn.us)');
    expect(staffResultsLabel({ staffEmail: 'pat@orono.k12.mn.us' })).toBe(
      'pat@orono.k12.mn.us'
    );
    expect(staffResultsLabel({})).toBeNull();
    expect(staffDisplayName(staff)).toBe('Pat T');
    expect(staffDisplayName({ staffEmail: 'x@orono.k12.mn.us' })).toBe(
      'x@orono.k12.mn.us'
    );
  });

  it('adds CSV name and email only when a staff row is present', () => {
    expect(hasStaffRows([{}, staff])).toBe(true);
    expect(hasStaffRows([{}, null])).toBe(false);
    expect(staffCsvCells(staff)).toEqual(['Pat T', 'pat@orono.k12.mn.us']);
  });

  it('marks a staff Flashcards link', () => {
    expect(flashcardAssignmentUrl('abc', 'staff')).toBe(
      `${window.location.origin}/flashcards/a/abc?staff=1`
    );
    expect(flashcardAssignmentUrl('abc', undefined)).toBe(
      `${window.location.origin}/flashcards/a/abc`
    );
  });
});
