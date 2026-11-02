import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('./firebaseAdmin', () => ({}));
const isDistrictStaffToken = vi.fn<() => Promise<boolean>>();
vi.mock('./districtStaff', () => ({
  isDistrictStaffToken: () => isDistrictStaffToken(),
}));

import {
  __resetAiCallerGateCache,
  assertAiTeacherCaller,
  isAiTeacherCaller,
  isTeacherShapedToken,
} from './aiCallerGate';

const adminGet =
  vi.fn<(name: string, id: string) => Promise<{ exists: boolean }>>();
const db = {
  collection: (name: string) => ({
    doc: (id: string) => ({ get: () => adminGet(name, id) }),
  }),
} as never;

const teacher = {
  email: 'Teacher@orono.k12.mn.us',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
};

beforeEach(() => {
  __resetAiCallerGateCache();
  isDistrictStaffToken.mockReset();
  adminGet.mockReset();
  adminGet.mockResolvedValue({ exists: false });
});

describe('isTeacherShapedToken', () => {
  it('rules out anonymous, unverified, emailless, student and PIN tokens', () => {
    expect(isTeacherShapedToken(teacher)).toBe(true);
    expect(
      isTeacherShapedToken({
        ...teacher,
        firebase: { sign_in_provider: 'anonymous' },
      })
    ).toBe(false);
    expect(isTeacherShapedToken({ ...teacher, email_verified: false })).toBe(
      false
    );
    expect(
      isTeacherShapedToken({ ...teacher, email_verified: undefined })
    ).toBe(false);
    expect(isTeacherShapedToken({ ...teacher, email: undefined })).toBe(false);
    expect(isTeacherShapedToken({ ...teacher, studentRole: true })).toBe(false);
    expect(isTeacherShapedToken({ ...teacher, pinLogin: true })).toBe(false);
  });
});

describe('isAiTeacherCaller', () => {
  it('admits a verified staff member', async () => {
    isDistrictStaffToken.mockResolvedValue(true);
    expect(await isAiTeacherCaller(db, teacher)).toBe(true);
  });

  it('admits a verified admin with no staff record', async () => {
    isDistrictStaffToken.mockResolvedValue(false);
    adminGet.mockResolvedValue({ exists: true });
    expect(await isAiTeacherCaller(db, teacher)).toBe(true);
    expect(adminGet).toHaveBeenCalledWith('admins', 'teacher@orono.k12.mn.us');
  });

  it('refuses a verified account that is neither staff nor admin', async () => {
    isDistrictStaffToken.mockResolvedValue(false);
    expect(
      await isAiTeacherCaller(db, { ...teacher, email: 'someone@gmail.com' })
    ).toBe(false);
  });

  it('never looks anything up for an unverified token', async () => {
    expect(
      await isAiTeacherCaller(db, { ...teacher, email_verified: false })
    ).toBe(false);
    expect(isDistrictStaffToken).not.toHaveBeenCalled();
    expect(adminGet).not.toHaveBeenCalled();
  });

  it('caches a yes but not a no', async () => {
    isDistrictStaffToken.mockResolvedValue(false);
    expect(await isAiTeacherCaller(db, teacher)).toBe(false);
    isDistrictStaffToken.mockResolvedValue(true);
    expect(await isAiTeacherCaller(db, teacher)).toBe(true);
    isDistrictStaffToken.mockResolvedValue(false);
    expect(await isAiTeacherCaller(db, teacher)).toBe(true);
    expect(isDistrictStaffToken).toHaveBeenCalledTimes(2);
  });
});

describe('assertAiTeacherCaller', () => {
  it('throws permission-denied for a refused caller', async () => {
    await expect(
      assertAiTeacherCaller(db, { firebase: { sign_in_provider: 'anonymous' } })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
