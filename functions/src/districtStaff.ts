// Staff and student checks that never trust the email domain: Orono students and staff share @orono.k12.mn.us.
import * as admin from 'firebase-admin';
import {
  isSafeEmailForOneRosterFilter,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from './classlinkShared';
import {
  fetchOneRosterUsersByEmail,
  isOneRosterStudent,
  type StudentLookupSecrets,
} from './studentEmailIdentity';

type Firestore = admin.firestore.Firestore;

/** An org member doc that makes its holder staff, as firestore.rules staffMemberOk(). */
export function isStaffMemberData(
  data: admin.firestore.DocumentData | undefined
): boolean {
  return (
    !!data &&
    (data.status ?? 'active') !== 'inactive' &&
    (data.roleId ?? '') !== 'student'
  );
}

/** True when a verified address holds an active, non-student member doc in the org its domain belongs to. */
export async function isDistrictStaffEmail(
  db: Firestore,
  email: string
): Promise<boolean> {
  const emailLower = email.trim().toLowerCase();
  const domain = normalizeEmailDomain(emailLower);
  if (!domain) return false;
  const orgId = await resolveOrgIdForDomain(db, domain);
  if (!orgId) return false;
  const member = await db
    .doc(`organizations/${orgId}/members/${emailLower}`)
    .get();
  return isStaffMemberData(member.data());
}

/** A Firebase ID token that is district staff: verified email, no student or PIN claim, and a staff member doc. */
export async function isDistrictStaffToken(
  db: Firestore,
  token: {
    email?: string;
    email_verified?: boolean;
    studentRole?: unknown;
    pinLogin?: unknown;
  }
): Promise<boolean> {
  if (
    token.email_verified !== true ||
    typeof token.email !== 'string' ||
    !token.email ||
    token.studentRole === true ||
    token.pinLogin === true
  ) {
    return false;
  }
  return isDistrictStaffEmail(db, token.email);
}

/** True for a mock-class member or a OneRoster student record; throws when ClassLink can't answer. */
export async function isKnownStudentEmail(
  db: Firestore,
  orgId: string,
  email: string,
  secrets: Pick<
    StudentLookupSecrets,
    'classlinkClientId' | 'classlinkClientSecret' | 'tenantUrl'
  >
): Promise<boolean> {
  const emailLower = email.trim().toLowerCase();
  const mock = await db
    .collection(`organizations/${orgId}/testClasses`)
    .where('memberEmails', 'array-contains', emailLower)
    .limit(1)
    .get();
  if (!mock.empty) return true;
  if (!isSafeEmailForOneRosterFilter(emailLower)) return true;
  if (
    !secrets.classlinkClientId ||
    !secrets.classlinkClientSecret ||
    !secrets.tenantUrl
  ) {
    throw new Error('ClassLink is not configured.');
  }
  const users = await fetchOneRosterUsersByEmail(emailLower, secrets);
  return users.some(isOneRosterStudent);
}
