// Shared teacher gate for the LTI callables; mirrors firestore.rules isDistrictStaff().
import * as admin from 'firebase-admin';
import { isDistrictStaffToken } from '../districtStaff';

const DISTRICT_EMAIL = /^[^@]+@orono\.k12\.mn\.us$/i;

/** True only for a verified district address holding a staff member doc; students share the domain. */
export async function isDistrictTeacher(token: {
  email?: string;
  email_verified?: boolean;
  studentRole?: unknown;
  pinLogin?: unknown;
}): Promise<boolean> {
  return (
    typeof token.email === 'string' &&
    DISTRICT_EMAIL.test(token.email) &&
    (await isDistrictStaffToken(admin.firestore(), token))
  );
}
