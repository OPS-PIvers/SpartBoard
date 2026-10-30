// Staff and student checks that never trust the email domain: Orono students and staff share @orono.k12.mn.us.
import * as admin from './firebaseAdmin';
import {
  isSafeEmailForOneRosterFilter,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from './classlinkShared';
import {
  fetchOneRosterUsersByEmail,
  isOneRosterStaff,
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

/** True for a mock-class member or a OneRoster student with no staff record; throws when ClassLink can't answer unless rosterOptional. */
export async function isKnownStudentEmail(
  db: Firestore,
  orgId: string,
  email: string,
  secrets: Pick<
    StudentLookupSecrets,
    'classlinkClientId' | 'classlinkClientSecret' | 'tenantUrl'
  >,
  opts: { rosterOptional?: boolean } = {}
): Promise<boolean> {
  const emailLower = email.trim().toLowerCase();
  const mock = await db
    .collection(`organizations/${orgId}/testClasses`)
    .where('memberEmails', 'array-contains', emailLower)
    .limit(1)
    .get();
  // ClassLink can't be asked about an address with a quote; treat it as not known, as before this check existed.
  if (!isSafeEmailForOneRosterFilter(emailLower)) return !mock.empty;
  try {
    if (
      !secrets.classlinkClientId ||
      !secrets.classlinkClientSecret ||
      !secrets.tenantUrl
    ) {
      throw new Error('ClassLink is not configured.');
    }
    const users = await fetchOneRosterUsersByEmail(emailLower, secrets);
    if (users.some(isOneRosterStaff)) return false;
    return !mock.empty || users.some(isOneRosterStudent);
  } catch (err) {
    // The dev project has placeholder ClassLink secrets and no real students.
    if (!mock.empty || opts.rosterOptional) return !mock.empty;
    throw err;
  }
}
