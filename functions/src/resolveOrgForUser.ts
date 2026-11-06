/**
 * resolveOrgForUser — dynamic email-domain → orgId resolution for the client.
 *
 * The client (AuthContext) needs to know which organization a signed-in user
 * belongs to so it can read the correct `/organizations/{orgId}/members/{email}`
 * doc, subscribe to that org's buildings, and derive the user's tier. The
 * domain→org mapping lives in `/organizations/{orgId}/domains` which is
 * readable only by org members (firestore.rules), so a brand-new external user
 * — who is not yet a member of anything — cannot resolve it client-side.
 *
 * This callable closes that gap. It runs the same verified-domain lookup that
 * `studentLoginV1` already uses ({@link resolveOrgIdForDomain}) against the
 * caller's OWN verified token, and returns just the resolved orgId (or null).
 * It exposes no other org's data and takes no client-supplied domain — the
 * domain is read from the verified Firebase Auth token only, so a caller can
 * never probe for an org they don't belong to.
 *
 * Returns `{ orgId: null }` (not an error) when the domain isn't registered to
 * any org, so the client can cleanly fall back to the free/no-org tier instead
 * of treating "unregistered domain" as a failure.
 *
 * AUTO-ENROLLMENT: resolving an org for a verified-email caller who has no
 * member doc also CREATES `/organizations/{orgId}/members/{emailLower}` as an
 * active teacher. Historically member docs only came from the 2026-04-19
 * backfill (scripts/backfill-org-members.js) or invite acceptance, so a
 * registered-domain teacher signing in for the first time silently landed in
 * the free tier with ClassLink and every org surface hidden. Students share
 * the staff domain, so enrollment needs a positive staff signal: ClassLink
 * lists the address with a staff role, or it is on the SpartBoard admin list
 * (/admins). A domain's `staff` role is the admin panel's default, so it is
 * not a signal. Numeric-local (student-ID) emails, student-only domains and
 * any address ClassLink or a mock class lists as a student are skipped,
 * existing docs keep their role and buildings (admin roles and 'inactive'
 * lockouts survive; an 'invited' staff doc only flips to active), the email
 * claim must be verified, and an org can opt out via
 * `autoEnrollDomainUsers: false` on its org doc. Anyone else joins by invite.
 * Enrollment failures are logged but never fail resolution.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
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
} from './studentEmailIdentity';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
} from './secrets';
import { assertViewAsAllowed } from './viewAsGuard';

if (!admin.apps.length) {
  admin.initializeApp();
}

export interface ResolveOrgForUserResponse {
  /** Resolved organization id, or null when the domain isn't registered. */
  orgId: string | null;
  /** Set when enrollment failed, so the client skips its session cache and retries next load. */
  enrollFailed?: true;
  /** Set when ClassLink or a mock class lists a caller with no member doc as a student. */
  rosterStudent?: true;
}

/**
 * Builds the ordered list of domains (`@example.com`, lowercased) to try, in
 * precedence order: the Workspace-issued `hd` claim first, then the email
 * suffix. This mirrors `studentLoginV1`, which resolves the `hd` domain and
 * FALLS BACK to the email domain when `hd` isn't registered (the `hd` claim is
 * not guaranteed on every Workspace configuration, and a user's primary email
 * domain can differ from `hd`). Duplicates are dropped so a typical user
 * (where `hd` == email domain) costs a single lookup. Pure so the precedence
 * is unit-testable without the Admin SDK.
 */
export function resolveDomainCandidates(
  hd: string | undefined,
  email: string | undefined
): string[] {
  const candidates: string[] = [];
  const hdDomain =
    typeof hd === 'string' && hd.trim().length > 0
      ? '@' + hd.trim().toLowerCase()
      : null;
  if (hdDomain) candidates.push(hdDomain);
  const emailDomain =
    typeof email === 'string' && email.length > 0
      ? normalizeEmailDomain(email)
      : null;
  if (emailDomain && !candidates.includes(emailDomain)) {
    candidates.push(emailDomain);
  }
  return candidates;
}

/**
 * True when an email is eligible for auto-enrollment as a teacher: non-empty
 * local part that is not all digits (numeric locals are student accounts —
 * same rail as backfill-org-members.js). Pure so it's unit-testable.
 */
export function isAutoEnrollableEmail(email: string): boolean {
  const local = email.split('@')[0] ?? '';
  return local.length > 0 && !/^\d+$/.test(local);
}

export type RosterRole = 'staff' | 'student' | 'unknown';

/** ClassLink's answer for an address, staff winning over a mock-class entry; throws when ClassLink can't answer unless rosterOptional. */
export async function lookupRosterRole(
  db: admin.firestore.Firestore,
  orgId: string,
  emailLower: string,
  opts: { rosterOptional: boolean }
): Promise<RosterRole> {
  const mock = await db
    .collection(`organizations/${orgId}/testClasses`)
    .where('memberEmails', 'array-contains', emailLower)
    .limit(1)
    .get();
  const fallback: RosterRole = mock.empty ? 'unknown' : 'student';
  // ClassLink can't be asked about an address with a quote.
  if (!isSafeEmailForOneRosterFilter(emailLower)) return fallback;
  try {
    const secrets = {
      classlinkClientId: CLASSLINK_CLIENT_ID.value(),
      classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
      tenantUrl: CLASSLINK_TENANT_URL.value(),
    };
    if (
      !secrets.classlinkClientId ||
      !secrets.classlinkClientSecret ||
      !secrets.tenantUrl
    ) {
      throw new Error('ClassLink is not configured.');
    }
    // Under this callable's 15 s limit.
    const users = await fetchOneRosterUsersByEmail(emailLower, secrets, 8000);
    if (users.some(isOneRosterStaff)) return 'staff';
    if (users.some(isOneRosterStudent)) return 'student';
    return fallback;
  } catch (err) {
    // The dev project has placeholder ClassLink secrets and only mock-class students.
    if (!mock.empty || opts.rosterOptional) return fallback;
    throw err;
  }
}

/** True when any verified doc for the matched domain registers it for students. */
async function isStudentDomain(
  db: admin.firestore.Firestore,
  orgId: string,
  domainWithAt: string
): Promise<boolean> {
  const snap = await db
    .collection(`organizations/${orgId}/domains`)
    .where('domain', '==', domainWithAt)
    .where('status', '==', 'verified')
    .get();
  return snap.docs.some((d) => d.get('role') === 'student');
}

/**
 * Upserts nothing — strictly CREATES the caller's member doc when absent.
 * Existing docs keep role and buildings (only 'invited' flips to active) so this can never
 * demote an admin or resurrect a deactivated member. Uses `create()` so a
 * concurrent duplicate loses cleanly (ALREADY_EXISTS is swallowed).
 */
async function autoEnrollMember(
  db: admin.firestore.Firestore,
  orgId: string,
  domainWithAt: string,
  uid: string,
  token: { email?: string; email_verified?: boolean; name?: string }
): Promise<'student' | undefined> {
  const email = token.email?.trim().toLowerCase() ?? '';
  if (!email || token.email_verified !== true) return;
  if (!isAutoEnrollableEmail(email)) return;

  const memberRef = db.doc(`organizations/${orgId}/members/${email}`);
  const memberSnap = await memberRef.get();
  if (memberSnap.exists) {
    await activateInvitedMember(memberRef, memberSnap, uid);
    return;
  }

  // Per-org opt-out: only read the org doc on the rare doc-missing path.
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (orgSnap.get('autoEnrollDomainUsers') === false) return;
  if (await isStudentDomain(db, orgId, domainWithAt)) return;
  // A student must never get a member doc; a ClassLink failure throws, so the next load retries.
  const rosterRole = await lookupRosterRole(db, orgId, email, {
    rosterOptional: process.env.GCLOUD_PROJECT === 'spartboard-dev',
  });
  if (rosterRole === 'student') return 'student';
  // Students share the staff domain, so an address nobody vouches for as staff joins by invite instead.
  if (
    rosterRole !== 'staff' &&
    !(await db.doc(`admins/${email}`).get()).exists
  ) {
    return;
  }

  try {
    await memberRef.create({
      email,
      orgId,
      roleId: 'teacher',
      buildingIds: [],
      status: 'active',
      name: typeof token.name === 'string' ? token.name : '',
      uid,
      addedBySource: 'auto-enroll:resolveOrgForUser',
    });
  } catch (err) {
    // gRPC 6 = ALREADY_EXISTS: a concurrent call won the create race.
    if ((err as { code?: number }).code !== 6) throw err;
  }
}

/** Signing in with the invited address claims the invite: only status, uid and lastActive change, and only on an unchanged 'invited' doc. */
async function activateInvitedMember(
  memberRef: admin.firestore.DocumentReference,
  memberSnap: admin.firestore.DocumentSnapshot,
  uid: string
): Promise<void> {
  if (memberSnap.get('status') !== 'invited') return;
  if (memberSnap.get('roleId') === 'student') return;
  try {
    await memberRef.update(
      { status: 'active', uid, lastActive: new Date().toISOString() },
      { lastUpdateTime: memberSnap.updateTime }
    );
  } catch (err) {
    // gRPC 9 = FAILED_PRECONDITION: an admin edited the doc mid-call; the next sign-in retries.
    if ((err as { code?: number }).code !== 9) throw err;
  }
}

export const resolveOrgForUser = onCall(
  {
    // 256MiB: the nodejs24 + firebase-admin cold-start footprint is ~135-144MiB,
    // which OOMs a 128MiB instance during the startup readiness check (the
    // instance never starts → every call returns `internal`). 256MiB is the
    // codebase standard and leaves comfortable headroom.
    memory: '256MiB',
    timeoutSeconds: 15,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
  },
  async (request): Promise<ResolveOrgForUserResponse> => {
    const viewAs = assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    // Read the domain from the verified token ONLY — never from request.data —
    // so the resolution is always scoped to the caller's own identity.
    const token = request.auth.token as {
      email?: string;
      hd?: string;
      email_verified?: boolean;
      name?: string;
    };
    const candidates = resolveDomainCandidates(token.hd, token.email);
    if (candidates.length === 0) {
      // No usable domain (e.g. anonymous/SSO-student token with no email
      // claim). No org to resolve — free tier.
      return { orgId: null };
    }
    // Unverified claims can't prove domain ownership (email/password sign-in allows a self-reported address) — same rail as studentLoginV1/isExternalCaller.
    if (token.email_verified !== true) {
      return { orgId: null };
    }

    const db = admin.firestore();
    // Try `hd` first, then the email domain — first registered match wins.
    // At most two sequential lookups (usually one after dedup).
    for (const domain of candidates) {
      const orgId = await resolveOrgIdForDomain(db, domain);
      if (orgId) {
        // First-sign-in provisioning; a failure here must not fail resolution
        // (the client would fall back to the operator org and lose the
        // resolved orgId entirely). The next app load retries.
        try {
          // View as never provisions the target (ADMIN_VIEW_AS.md D6).
          if (!viewAs) {
            const enrolled = await autoEnrollMember(
              db,
              orgId,
              domain,
              request.auth.uid,
              token
            );
            if (enrolled === 'student') return { orgId, rosterStudent: true };
          }
        } catch (err) {
          console.error(
            `[resolveOrgForUser] auto-enroll failed for org ${orgId}:`,
            err
          );
          return { orgId, enrollFailed: true };
        }
        return { orgId };
      }
    }
    return { orgId: null };
  }
);
