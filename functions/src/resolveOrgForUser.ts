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

export const resolveOrgForUser = onCall(
  {
    memory: '128MiB',
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
    const token = request.auth.token as { email?: string; hd?: string };
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
      if (orgId) return { orgId };
    }
    return { orgId: null };
  }
);
