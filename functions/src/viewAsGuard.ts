// Callable-side enforcement of a super admin "View as" token (docs/plans/ADMIN_VIEW_AS.md D7).
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

/** A pinLoginV1 token is its student only in the one session its PIN was proven for. */
function assertPinSessionScope(request: RequestWithAuth): void {
  const token = request.auth?.token;
  if (!token || typeof token !== 'object') return;
  const t = token as Record<string, unknown>;
  if (t.pinLogin !== true) return;
  const data = request.data;
  const sessionId =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>).sessionId
      : undefined;
  if (typeof t.pinSessionId !== 'string' || sessionId !== t.pinSessionId) {
    throw new HttpsError('permission-denied', 'Sign in to do this.');
  }
}

export interface ViewAsGuardOptions {
  /** A read-only callable: only the expiry is enforced. */
  read?: boolean;
  /** Assign, start, share, invite, AI or export (D14). Needs an unlocked session. */
  outward?: boolean;
  /** A sign-in callable that never acts as the caller, so a PIN token from any session may call it. */
  signIn?: boolean;
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

/** Throws when a view-as token may not run this callable; returns the claim (or null) so callers can audit. */
export function assertViewAsAllowed(
  request: RequestWithAuth,
  options: ViewAsGuardOptions = {},
  now: number = Date.now()
): ViewAsClaim | null {
  if (!options.signIn) assertPinSessionScope(request);
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
