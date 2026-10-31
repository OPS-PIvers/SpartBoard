// Staff-audience identity from a caller's ID token; mirrors utils/staffAudience.ts and staffJoinOk in firestore.rules.
import type * as admin from './firebaseAdmin';
import { isDistrictStaffEmail } from './districtStaff';

export interface StaffIdentity {
  staffEmail: string;
  staffName: string;
}

const DISTRICT_EMAIL = /^[^@]+@orono\.k12\.mn\.us$/;

/** The caller's verified district staff identity, or null for students, PIN tokens and other accounts. */
export function staffIdentityFromToken(
  token: Record<string, unknown> | null | undefined
): StaffIdentity | null {
  if (!token) return null;
  const email =
    typeof token.email === 'string' ? token.email.toLowerCase() : '';
  if (
    token.email_verified !== true ||
    token.studentRole === true ||
    token.pinLogin === true ||
    !DISTRICT_EMAIL.test(email)
  ) {
    return null;
  }
  return {
    staffEmail: email,
    staffName: typeof token.name === 'string' ? token.name : '',
  };
}

/** The token's staff identity only when it also holds a staff member doc; students share the district domain. */
export async function verifiedStaffIdentity(
  db: admin.firestore.Firestore,
  token: Record<string, unknown> | null | undefined
): Promise<StaffIdentity | null> {
  const identity = staffIdentityFromToken(token);
  if (!identity) return null;
  return (await isDistrictStaffEmail(db, identity.staffEmail))
    ? identity
    : null;
}
