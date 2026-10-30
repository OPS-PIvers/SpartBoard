import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as admin from 'firebase-admin';

const resolveOrgIdForDomainMock = vi.fn();
const fetchUsersMock = vi.fn();

vi.mock('./classlinkShared', () => ({
  normalizeEmailDomain: (email: string): string | null => {
    const at = email.lastIndexOf('@');
    if (at < 0 || at === email.length - 1) return null;
    return '@' + email.slice(at + 1).toLowerCase();
  },
  resolveOrgIdForDomain: (...args: unknown[]): Promise<string | null> =>
    resolveOrgIdForDomainMock(...args) as Promise<string | null>,
  isSafeEmailForOneRosterFilter: (email: string) => !email.includes("'"),
}));
vi.mock('./studentEmailIdentity', async (orig) => ({
  ...(await orig<typeof import('./studentEmailIdentity')>()),
  fetchOneRosterUsersByEmail: (...args: unknown[]): Promise<unknown[]> =>
    fetchUsersMock(...args) as Promise<unknown[]>,
}));

import {
  isDistrictStaffEmail,
  isDistrictStaffToken,
  isKnownStudentEmail,
  isStaffMemberData,
} from './districtStaff';
import {
  isOneRosterStaff,
  isOneRosterStudent,
  type OneRosterUserWithRole,
} from './studentEmailIdentity';

const SECRETS = {
  classlinkClientId: 'id',
  classlinkClientSecret: 'secret',
  tenantUrl: 'https://tenant.example',
};

/** A Firestore stub holding member docs by path and mock-class member emails. */
function fakeDb(
  members: Record<string, admin.firestore.DocumentData>,
  mockMembers: string[] = []
): admin.firestore.Firestore {
  return {
    doc: (path: string) => ({
      get: () => Promise.resolve({ data: () => members[path] }),
    }),
    collection: () => ({
      where: (_f: string, _op: string, email: string) => ({
        limit: () => ({
          get: () => Promise.resolve({ empty: !mockMembers.includes(email) }),
        }),
      }),
    }),
  } as unknown as admin.firestore.Firestore;
}

const TEACHER = 'organizations/orono/members/pat.teacher@orono.k12.mn.us';

beforeEach(() => {
  resolveOrgIdForDomainMock.mockReset();
  resolveOrgIdForDomainMock.mockResolvedValue('orono');
  fetchUsersMock.mockReset();
});

describe('isStaffMemberData', () => {
  it('admits an active, non-student member and nothing else', () => {
    expect(isStaffMemberData({ roleId: 'teacher', status: 'active' })).toBe(
      true
    );
    expect(isStaffMemberData({ roleId: 'teacher' })).toBe(true);
    expect(isStaffMemberData({ roleId: 'teacher', status: 'inactive' })).toBe(
      false
    );
    expect(isStaffMemberData({ roleId: 'student', status: 'active' })).toBe(
      false
    );
    expect(isStaffMemberData(undefined)).toBe(false);
  });
});

describe('isDistrictStaffEmail', () => {
  it('is true only with a staff member doc in the domain org', async () => {
    const db = fakeDb({ [TEACHER]: { roleId: 'teacher', status: 'active' } });
    expect(await isDistrictStaffEmail(db, 'Pat.Teacher@orono.k12.mn.us')).toBe(
      true
    );
    // A student on the same domain has no member doc.
    expect(await isDistrictStaffEmail(db, '704522@orono.k12.mn.us')).toBe(
      false
    );
  });

  it('is false for an unregistered domain', async () => {
    resolveOrgIdForDomainMock.mockResolvedValue(null);
    expect(await isDistrictStaffEmail(fakeDb({}), 'a@example.com')).toBe(false);
  });
});

describe('isDistrictStaffToken', () => {
  const db = fakeDb({ [TEACHER]: { roleId: 'teacher', status: 'active' } });
  const email = 'pat.teacher@orono.k12.mn.us';

  it('admits a verified staff token', async () => {
    expect(
      await isDistrictStaffToken(db, { email, email_verified: true })
    ).toBe(true);
  });

  it('refuses unverified, student-role and PIN tokens even with a staff address', async () => {
    expect(await isDistrictStaffToken(db, { email })).toBe(false);
    expect(
      await isDistrictStaffToken(db, {
        email,
        email_verified: true,
        studentRole: true,
      })
    ).toBe(false);
    expect(
      await isDistrictStaffToken(db, {
        email,
        email_verified: true,
        pinLogin: true,
      })
    ).toBe(false);
  });
});

describe('isKnownStudentEmail', () => {
  it('is true for a mock-class member without asking ClassLink', async () => {
    const db = fakeDb({}, ['sstudent25@orono.k12.mn.us']);
    expect(
      await isKnownStudentEmail(
        db,
        'orono',
        'SStudent25@orono.k12.mn.us',
        SECRETS
      )
    ).toBe(true);
    expect(fetchUsersMock).not.toHaveBeenCalled();
  });

  it('follows the OneRoster role', async () => {
    fetchUsersMock.mockResolvedValueOnce([{ sourcedId: 'S', role: 'student' }]);
    expect(
      await isKnownStudentEmail(
        fakeDb({}),
        'orono',
        'kid@orono.k12.mn.us',
        SECRETS
      )
    ).toBe(true);
    fetchUsersMock.mockResolvedValueOnce([{ sourcedId: 'T', role: 'teacher' }]);
    expect(
      await isKnownStudentEmail(
        fakeDb({}),
        'orono',
        'pat@orono.k12.mn.us',
        SECRETS
      )
    ).toBe(false);
    fetchUsersMock.mockResolvedValueOnce([]);
    expect(
      await isKnownStudentEmail(
        fakeDb({}),
        'orono',
        'sub@orono.k12.mn.us',
        SECRETS
      )
    ).toBe(false);
  });

  it('throws when ClassLink is not configured or fails, so nothing is enrolled', async () => {
    await expect(
      isKnownStudentEmail(fakeDb({}), 'orono', 'pat@orono.k12.mn.us', {
        ...SECRETS,
        tenantUrl: '',
      })
    ).rejects.toThrow();
    fetchUsersMock.mockRejectedValueOnce(new Error('down'));
    await expect(
      isKnownStudentEmail(fakeDb({}), 'orono', 'pat@orono.k12.mn.us', SECRETS)
    ).rejects.toThrow('down');
  });
});

describe('OneRoster roles', () => {
  const rec = (o: Partial<OneRosterUserWithRole>): OneRosterUserWithRole => ({
    sourcedId: 'x',
    email: '',
    givenName: '',
    familyName: '',
    ...o,
  });

  it('a student is never staff, and a role-less record is neither', () => {
    const records = [
      rec({ role: 'student' }),
      rec({ role: 'teacher' }),
      rec({ roles: [{ roleType: 'primary', role: 'teacher' }] }),
      rec({ roles: [{ roleType: 'primary' }] }),
      rec({}),
      rec({ role: 'districtAdministrator' }),
      rec({ role: 'guardian' }),
    ];
    expect(records.map(isOneRosterStudent)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(records.map(isOneRosterStaff)).toEqual([
      false,
      true,
      true,
      false,
      false,
      true,
      false,
    ]);
  });

  it('staff also enrolled in a course stay staff', () => {
    const mixed = rec({ roles: [{ role: 'teacher' }, { role: 'student' }] });
    expect(isOneRosterStaff(mixed)).toBe(true);
  });
});
