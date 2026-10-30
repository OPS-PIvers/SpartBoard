// Maps a verified student email to its pseudonym uid, shared by studentLoginV1 and the Focus endpoints (CHROME_EXTENSION.md F3).
import * as admin from './firebaseAdmin';
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

export function isOneRosterStudent(user: OneRosterUserWithRole): boolean {
  if (user.role && user.role.toLowerCase() === 'student') return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some((r) => {
      const v = (r.role ?? r.roleType ?? '').toLowerCase();
      return v === 'student' || v === 'primary';
    });
  }
  return false;
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
      { params: userParams, headers: { ...userHeaders } }
    );
    users = userResp.data.users ?? [];
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
