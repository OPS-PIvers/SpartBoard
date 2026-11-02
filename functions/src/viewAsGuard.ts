// Callable-side enforcement of a super admin "View as" token (docs/plans/shipped/ADMIN_VIEW_AS.md D7).
import { HttpsError } from 'firebase-functions/v2/https';

/** The `viewAs` claim minted by startViewAsSessionV1; `exp` is epoch ms. Mirrors types/viewAs.ts. */
export interface ViewAsClaim {
  by: string;
  sid: string;
  ro: boolean;
  adminTarget: boolean;
  exp: number;
}

interface RequestWithAuth {
  auth?: { uid?: string; token?: unknown } | null;
  data?: unknown;
}

export interface ViewAsGuardOptions {
  /** A read-only callable: only the expiry is enforced. */
  read?: boolean;
  /** Assign, start, share, invite, AI or export (D14). Needs an unlocked session. */
  outward?: boolean;
}

/** The parsed claim, or null for an ordinary token. A malformed claim reads as expired and read-only. */
export function readViewAsClaim(request: RequestWithAuth): ViewAsClaim | null {
  const token = request.auth?.token;
  if (!token || typeof token !== 'object') return null;
  const raw = (token as Record<string, unknown>).viewAs;
  if (raw === undefined || raw === null) return null;
  const c = (typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    by: typeof c.by === 'string' ? c.by : '',
    sid: typeof c.sid === 'string' ? c.sid : '',
    ro: c.ro !== false,
    adminTarget: c.adminTarget !== false,
    exp: typeof c.exp === 'number' ? c.exp : 0,
  };
}

// A pre-scope PIN token (no pinSessionId) keeps its old reach this long after sign-in, as firestore.rules does.
export const LEGACY_PIN_TOKEN_GRACE_MS = 12 * 60 * 60 * 1000;

/** A pinLoginV1 token is proven for one session, so it may not name any other `sessionId`. */
export function assertPinLoginSession(
  request: RequestWithAuth,
  now: number = Date.now()
): void {
  const token = request.auth?.token;
  if (!token || typeof token !== 'object') return;
  const claims = token as Record<string, unknown>;
  if (claims.pinLogin !== true) return;
  if (
    claims.pinSessionId === undefined &&
    typeof claims.auth_time === 'number' &&
    now < claims.auth_time * 1000 + LEGACY_PIN_TOKEN_GRACE_MS
  ) {
    return;
  }
  const data = request.data;
  const sessionId =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>).sessionId
      : undefined;
  if (sessionId !== undefined && sessionId !== claims.pinSessionId) {
    throw new HttpsError(
      'permission-denied',
      'Join this activity with your PIN.'
    );
  }
}

/** Throws when a view-as token may not run this callable; returns the claim (or null) so callers can audit. */
export function assertViewAsAllowed(
  request: RequestWithAuth,
  options: ViewAsGuardOptions = {},
  now: number = Date.now()
): ViewAsClaim | null {
  assertPinLoginSession(request, now);
  const claim = readViewAsClaim(request);
  if (!claim) return null;
  if (!claim.sid || !claim.by || now >= claim.exp) {
    throw new HttpsError(
      'permission-denied',
      'This View as session has ended.'
    );
  }
  if (options.read && !options.outward) return claim;
  if (claim.ro) {
    throw new HttpsError('permission-denied', 'Unlock edits to do this.');
  }
  return claim;
}
