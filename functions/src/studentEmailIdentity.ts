// Maps a verified student email to its pseudonym uid, shared by studentLoginV1 and the Focus endpoints (CHROME_EXTENSION.md F3).
import * as admin from 'firebase-admin';
import axios from 'axios';
import {
  ONEROSTER_BASE,
  computeStudentUid,
  getOAuthHeaders,
  isSafeEmailForOneRosterFilter,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
  type ClassLinkUser,
} from './classlinkShared';

export const STUDENT_LOGIN_CLASS_IDS_MAX = 20;

export interface OneRosterUserWithRole extends ClassLinkUser {
  role?: string;
  roles?: Array<{ role?: string; roleType?: string }>;
}

const ONEROSTER_STAFF_ROLES = new Set([
  'teacher',
  'administrator',
  'aide',
  'proctor',
  'principal',
  'counselor',
  'districtadministrator',
  'siteadministrator',
  'systemadministrator',
]);

function oneRosterRoleNames(user: OneRosterUserWithRole): string[] {
  const names = typeof user.role === 'string' ? [user.role] : [];
  for (const r of Array.isArray(user.roles) ? user.roles : []) {
    if (typeof r?.role === 'string') names.push(r.role);
  }
  return names.map((n) => n.toLowerCase());
}

/** A student record; a roles entry with only roleType 'primary' still counts, as studentLoginV1 always has. */
export function isOneRosterStudent(user: OneRosterUserWithRole): boolean {
  if (oneRosterRoleNames(user).includes('student')) return true;
  return (
    Array.isArray(user.roles) &&
    user.roles.some(
      (r) => !r?.role && (r?.roleType ?? '').toLowerCase() === 'primary'
    )
  );
}

/** A staff record: a teacher, aide, counselor or administrator role (staff also enrolled in a course still count). */
export function isOneRosterStaff(user: OneRosterUserWithRole): boolean {
  return oneRosterRoleNames(user).some((r) => ONEROSTER_STAFF_ROLES.has(r));
}

export interface StudentLookupSecrets {
  hmacSecret: string;
  classlinkClientId: string;
  classlinkClientSecret: string;
  tenantUrl: string;
}

export type ResolvedStudent =
  | { kind: 'test'; orgId: string; uid: string; mockClassIds: string[] }
  | { kind: 'roster'; orgId: string; uid: string; sourcedId: string };

export type StudentLookupFailure =
  | 'malformed-email'
  | 'rejected-domain'
  | 'not-in-roster'
  | 'roster-unavailable';

/** Carries a failure class only; never the email. */
export class StudentLookupError extends Error {
  constructor(readonly reason: StudentLookupFailure) {
    super(reason);
  }
}

/** Org gate, the mock-class path (`test:` uid), then the OneRoster user lookup, in studentLoginV1's order. No PII is logged or stored. */
export async function resolveStudentByEmail(
  db: admin.firestore.Firestore,
  verified: { email: string; hd?: string },
  secrets: StudentLookupSecrets,
  logTag: string
): Promise<ResolvedStudent> {
  const { email, hd } = verified;
  const emailDomain = normalizeEmailDomain(email);
  if (!emailDomain) throw new StudentLookupError('malformed-email');
  // Prefer the Workspace `hd` claim, falling back to the email suffix since `hd` isn't on every configuration.
  const hdDomain = hd ? '@' + hd.toLowerCase() : null;
  let orgId = hdDomain ? await resolveOrgIdForDomain(db, hdDomain) : null;
  if (!orgId) orgId = await resolveOrgIdForDomain(db, emailDomain);
  if (!orgId) {
    // Counter for monitoring alert on misconfiguration / unregistered schools.
    console.warn(`[${logTag}] students_rejected_domain`);
    throw new StudentLookupError('rejected-domain');
  }

  // Admin-managed testClasses exercise the student flow without ClassLink; `test:` uids never collide with sourcedId ones.
  const emailLower = email.toLowerCase();
  const testClassSnap = await db
    .collection(`organizations/${orgId}/testClasses`)
    .where('memberEmails', 'array-contains', emailLower)
    .limit(STUDENT_LOGIN_CLASS_IDS_MAX)
    .get();
  if (!testClassSnap.empty) {
    // Monitoring counter — surface any prod use of the bypass.
    console.warn(`[${logTag}] test_bypass_used`, { orgId });
    return {
      kind: 'test',
      orgId,
      uid: computeStudentUid(`test:${emailLower}`, secrets.hmacSecret),
      mockClassIds: testClassSnap.docs.map((d) => d.id),
    };
  }

  // OneRoster lookup; the sourcedId is held in memory only, never written.
  if (!isSafeEmailForOneRosterFilter(email)) {
    console.warn(`[${logTag}] students_not_in_roster`);
    throw new StudentLookupError('not-in-roster');
  }
  let users: OneRosterUserWithRole[];
  try {
    users = await fetchOneRosterUsersByEmail(email, secrets);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(
        `[${logTag}] ClassLink request failed:`,
        err.response?.status
      );
    } else {
      console.error(`[${logTag}] ClassLink request failed.`);
    }
    throw new StudentLookupError('roster-unavailable');
  }
  const studentUser = users.find(isOneRosterStudent);
  if (!studentUser) {
    console.warn(`[${logTag}] students_not_in_roster`);
    throw new StudentLookupError('not-in-roster');
  }
  return {
    kind: 'roster',
    orgId,
    uid: computeStudentUid(studentUser.sourcedId, secrets.hmacSecret),
    sourcedId: studentUser.sourcedId,
  };
}

/** The OneRoster user records for one address; the caller checks isSafeEmailForOneRosterFilter first. */
export async function fetchOneRosterUsersByEmail(
  email: string,
  secrets: Pick<
    StudentLookupSecrets,
    'classlinkClientId' | 'classlinkClientSecret' | 'tenantUrl'
  >
): Promise<OneRosterUserWithRole[]> {
  const usersBaseUrl = `${secrets.tenantUrl.replace(/\/$/, '')}${ONEROSTER_BASE}/users`;
  const userParams = { filter: `email='${email}'` };
  const userHeaders = getOAuthHeaders(
    usersBaseUrl,
    userParams,
    'GET',
    secrets.classlinkClientId,
    secrets.classlinkClientSecret
  );
  const userResp = await axios.get<{ users: OneRosterUserWithRole[] }>(
    usersBaseUrl,
    { params: userParams, headers: { ...userHeaders }, timeout: 8000 }
  );
  return userResp.data.users ?? [];
}
