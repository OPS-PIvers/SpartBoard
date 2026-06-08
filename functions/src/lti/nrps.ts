// Schoology LTI 1.3 — Names and Role Provisioning Service (NRPS) client.
//
// Fetches a context's membership roster from the platform-hosted
// `context_memberships_url` (carried on the launch) so the teacher monitor can
// resolve a Schoology student's pseudonym uid → real name ON READ — exactly
// like the ClassLink/OneRoster path. Names are returned to the caller and
// never persisted; nothing about a student's name comes to rest in Firestore.
//
// Auth is the same client_credentials + signed-JWT bearer the AGS client uses
// (getAgsAccessToken), just scoped to NRPS_SCOPE. We only ever GET.

// NRPS v2 membership container media type — sent as `Accept` so the platform
// returns the v2 shape (members[] with user_id + name claims).
const MEMBERSHIP_ACCEPT =
  'application/vnd.ims.lti-nrps.v2.membershipcontainer+json';
const NET_TIMEOUT_MS = 15000;
// Hard cap on pages followed via the `Link: rel="next"` header so a malformed
// or hostile pagination loop can't pin the function. A class is ≤ ~40 members
// and platforms page generously; 20 pages is far more than any real roster.
const MAX_PAGES = 20;

/** A single resolved member, reduced to the PII we surface (name only). */
export interface NrpsMember {
  /** The LTI `sub` (platform user id) — same value the launch carries. */
  userId: string;
  givenName: string;
  familyName: string;
  /**
   * Platform-released email, lowercased — present ONLY when the platform's NRPS
   * config releases it (many don't). Used TRANSIENTLY to auto-match a Schoology
   * section to a ClassLink class by roster-email overlap; it is never returned to
   * a client and never persisted (same rule as names). Empty string when absent.
   */
  email: string;
  /** LIS role URIs; lets callers filter to Learners if they want. */
  roles: string[];
  /** Membership status, e.g. 'Active' / 'Inactive' (absent on some platforms). */
  status: string;
}

interface RawMember {
  user_id?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  name?: unknown;
  email?: unknown;
  roles?: unknown;
  status?: unknown;
}

interface MembershipPage {
  ok: boolean;
  status: number;
  members: RawMember[];
  /** Absolute URL of the next page, or null when there is none. */
  nextUrl: string | null;
}

const asStr = (v: unknown): string =>
  typeof v === 'string' && v.length > 0 ? v : '';

/** Parse a single RFC5988 `Link` header for the `rel="next"` target. */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Header form: `<https://…?page=2>; rel="next", <https://…>; rel="first"`
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?([^";]+)"?/i);
    if (m && m[2].trim().toLowerCase() === 'next') return m[1].trim();
  }
  return null;
}

/**
 * Seam for the single outbound GET so unit tests can stub it without a live
 * platform. Mirrors `classroomAddonNet` / the AGS client style.
 */
export const nrpsNet = {
  async fetchMembershipPage(
    url: string,
    accessToken: string
  ): Promise<MembershipPage> {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: MEMBERSHIP_ACCEPT,
        },
        signal: AbortSignal.timeout(NET_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Drain so undici returns the socket to the pool even on the error path.
        if (typeof res.text === 'function') await res.text().catch(() => '');
        console.warn(`[nrps] membership fetch ${res.status}`);
        return { ok: false, status: res.status, members: [], nextUrl: null };
      }
      const body = (await res.json()) as { members?: unknown };
      const members = Array.isArray(body.members)
        ? (body.members as RawMember[])
        : [];
      const nextUrl = parseNextLink(res.headers.get('link'));
      return { ok: true, status: res.status, members, nextUrl };
    } catch (err) {
      // Network failure / timeout / abort → empty page; the caller surfaces a
      // clean "couldn't resolve names" rather than an unhandled rejection.
      console.warn('[nrps] membership fetch failed (network/timeout):', err);
      return { ok: false, status: 0, members: [], nextUrl: null };
    }
  },
};

/**
 * Fetch every member of a context, following `Link: rel="next"` pagination up
 * to MAX_PAGES. Returns reduced {userId, givenName, familyName, roles, status}.
 * Members missing a `user_id` are skipped (can't be mapped to a response doc).
 *
 * When the platform sends only a composite `name` (no given/family parts —
 * some privacy configurations do this), the whole name is placed in
 * `givenName` so the teacher still sees a full label (`formatStudentName`
 * joins given + family).
 *
 * Throws only if the FIRST page errors (so the caller can distinguish "no
 * access / bad URL" from "empty roster"). Subsequent page errors stop
 * pagination and return what was collected so far.
 */
export async function fetchNrpsMembers(
  membershipUrl: string,
  accessToken: string
): Promise<NrpsMember[]> {
  const out: NrpsMember[] = [];
  let url: string | null = membershipUrl;
  let page = 0;
  while (url && page < MAX_PAGES) {
    const result: MembershipPage = await nrpsNet.fetchMembershipPage(
      url,
      accessToken
    );
    if (!result.ok) {
      if (page === 0) {
        throw new Error(
          `NRPS membership fetch failed (status ${result.status})`
        );
      }
      break; // partial roster is better than none
    }
    for (const m of result.members) {
      const userId = asStr(m.user_id);
      if (!userId) continue;
      const given = asStr(m.given_name);
      const family = asStr(m.family_name);
      const full = asStr(m.name);
      // Prefer structured given/family; fall back to the composite `name`.
      const hasStructured = !!(given || family);
      out.push({
        userId,
        givenName: hasStructured ? given : full,
        familyName: hasStructured ? family : '',
        // Lowercased for case-insensitive overlap matching; '' when not released.
        email: asStr(m.email).toLowerCase(),
        roles: Array.isArray(m.roles)
          ? m.roles.filter((r): r is string => typeof r === 'string')
          : [],
        status: asStr(m.status),
      });
    }
    url = result.nextUrl;
    page += 1;
  }
  return out;
}
