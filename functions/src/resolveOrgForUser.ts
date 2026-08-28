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
 * the free tier with ClassLink and every org surface hidden. Guards mirror the
 * backfill: numeric-local (student-ID) emails are skipped, existing docs are
 * never touched (admin roles and 'inactive' lockouts survive), the email claim
 * must be verified, and an org can opt out via `autoEnrollDomainUsers: false`
 * on its org doc. Enrollment failures are logged but never fail resolution.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { normalizeEmailDomain, resolveOrgIdForDomain } from './classlinkShared';

if (!admin.apps.length) {
  admin.initializeApp();
}

export interface ResolveOrgForUserResponse {
  /** Resolved organization id, or null when the domain isn't registered. */
  orgId: string | null;
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

/**
 * Upserts nothing — strictly CREATES the caller's member doc when absent.
 * Existing docs (any role, any status) are left untouched so this can never
 * demote an admin or resurrect a deactivated member. Uses `create()` so a
 * concurrent duplicate loses cleanly (ALREADY_EXISTS is swallowed).
 */
async function autoEnrollMember(
  db: admin.firestore.Firestore,
  orgId: string,
  uid: string,
  token: { email?: string; email_verified?: boolean; name?: string }
): Promise<void> {
  const email = token.email?.trim().toLowerCase() ?? '';
  if (!email || token.email_verified !== true) return;
  if (!isAutoEnrollableEmail(email)) return;

  const memberRef = db.doc(`organizations/${orgId}/members/${email}`);
  const memberSnap = await memberRef.get();
  if (memberSnap.exists) return;

  // Per-org opt-out: only read the org doc on the rare doc-missing path.
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (orgSnap.get('autoEnrollDomainUsers') === false) return;

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

export const resolveOrgForUser = onCall(
  {
    // 256MiB: the nodejs24 + firebase-admin cold-start footprint is ~135-144MiB,
    // which OOMs a 128MiB instance during the startup readiness check (the
    // instance never starts → every call returns `internal`). 256MiB is the
    // codebase standard and leaves comfortable headroom.
    memory: '256MiB',
    timeoutSeconds: 15,
  },
  async (request): Promise<ResolveOrgForUserResponse> => {
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
          await autoEnrollMember(db, orgId, request.auth.uid, token);
        } catch (err) {
          console.error(
            `[resolveOrgForUser] auto-enroll failed for org ${orgId}:`,
            err
          );
        }
        return { orgId };
      }
    }
    return { orgId: null };
  }
);
