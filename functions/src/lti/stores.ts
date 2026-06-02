// Schoology LTI 1.3 — single-use, TTL'd Firestore stores.
//
// Two server-internal collections (Admin SDK only; client read/write denied by rules):
//   • lti_oidc_state/{state}   — binds the OIDC `nonce` to a launch across the
//     login-init → callback hop, WITHOUT a third-party cookie (the iframe blocks them).
//   • lti_launch_codes/{code}  — a one-time handoff of validated launch claims from the
//     server-side callback to the SPA route (exchanged via the ltiExchange callable).
//
// Each doc carries BOTH:
//   • `expiresAt`   — a Timestamp, for a Firestore TTL policy to sweep stale docs.
//   • `expiresAtMs` — the same instant as a number, for the in-code expiry guard
//     (keeps this logic free of Timestamp deps, so it's trivially unit-testable).
// Consumption is a transaction (atomic read+delete) so a captured value can never be
// replayed; the in-code expiry check is defence-in-depth on top of the TTL sweep.

import { randomBytes } from 'node:crypto';
import type * as admin from 'firebase-admin';

type Db = admin.firestore.Firestore;

export const LTI_STATE_COLLECTION = 'lti_oidc_state';
export const LTI_LAUNCH_CODE_COLLECTION = 'lti_launch_codes';

const STATE_TTL_MS = 10 * 60 * 1000; // OIDC round-trip window
const LAUNCH_CODE_TTL_MS = 5 * 60 * 1000; // callback → SPA exchange window

/** Cryptographically-random opaque id, URL-safe (base64url). */
export function newOpaqueId(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function isExpired(data: { expiresAtMs?: number } | undefined): boolean {
  const exp = typeof data?.expiresAtMs === 'number' ? data.expiresAtMs : 0;
  return exp > 0 && exp < Date.now();
}

// ── OIDC state/nonce ───────────────────────────────────────────────────────
export async function putOidcState(
  db: Db,
  state: string,
  nonce: string
): Promise<void> {
  const now = Date.now();
  await db
    .collection(LTI_STATE_COLLECTION)
    .doc(state)
    .set({
      nonce,
      createdAt: now,
      expiresAtMs: now + STATE_TTL_MS,
      expiresAt: new Date(now + STATE_TTL_MS),
    });
}

/** Atomically reads + deletes the state doc. Returns the nonce, or null if missing/expired. */
export async function consumeOidcState(
  db: Db,
  state: string
): Promise<string | null> {
  if (!state) return null;
  const ref = db.collection(LTI_STATE_COLLECTION).doc(state);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as { nonce?: string; expiresAtMs?: number };
    tx.delete(ref);
    if (isExpired(data)) return null;
    return typeof data.nonce === 'string' && data.nonce ? data.nonce : null;
  });
}

// ── Launch codes ────────────────────────────────────────────────────────────
export interface StoredLaunch {
  role: 'student' | 'teacher' | 'unknown';
  messageType: string;
  sub: string;
  deploymentId: string;
  contextId: string | null;
  contextTitle: string | null;
  resourceLinkId: string | null;
  ags: unknown;
  nrps: unknown;
  deepLinking: unknown;
  custom: Record<string, unknown> | null;
  email: string | null;
  name: string | null;
}

export async function mintLaunchCode(
  db: Db,
  launch: StoredLaunch
): Promise<string> {
  const code = newOpaqueId(32);
  const now = Date.now();
  await db
    .collection(LTI_LAUNCH_CODE_COLLECTION)
    .doc(code)
    .set({
      ...launch,
      createdAt: now,
      expiresAtMs: now + LAUNCH_CODE_TTL_MS,
      expiresAt: new Date(now + LAUNCH_CODE_TTL_MS),
    });
  return code;
}

/** Atomically reads + deletes the launch code. Returns the stored launch, or null. */
export async function consumeLaunchCode(
  db: Db,
  code: string
): Promise<StoredLaunch | null> {
  if (!code) return null;
  const ref = db.collection(LTI_LAUNCH_CODE_COLLECTION).doc(code);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as
      | (StoredLaunch & { expiresAtMs?: number })
      | undefined;
    tx.delete(ref);
    if (!data || isExpired(data)) return null;
    // Return only the StoredLaunch fields (drop expiresAt*/createdAt bookkeeping).
    return {
      role: data.role,
      messageType: data.messageType,
      sub: data.sub,
      deploymentId: data.deploymentId,
      contextId: data.contextId,
      contextTitle: data.contextTitle,
      resourceLinkId: data.resourceLinkId,
      ags: data.ags ?? null,
      nrps: data.nrps ?? null,
      deepLinking: data.deepLinking ?? null,
      custom: data.custom ?? null,
      email: data.email ?? null,
      name: data.name ?? null,
    };
  });
}

// ── Grade-push authorization (LIVE-token model) ──────────────────────────────
// An instructor resource-link launch mints one of these; the grader (signed in
// with the teacher's own Google account to read the session) passes the token to
// authorize an AGS grade push. Reusable within a TTL grading window — a teacher
// may push several times as more students finish.
export const LTI_PUSH_AUTH_COLLECTION = 'lti_grade_push_auth';
const PUSH_AUTH_TTL_MS = 2 * 60 * 60 * 1000; // 2h grading window

export async function mintGradePushAuth(
  db: Db,
  opts: { resourceLinkId: string; contextId: string | null }
): Promise<string> {
  const token = newOpaqueId(32);
  const now = Date.now();
  await db
    .collection(LTI_PUSH_AUTH_COLLECTION)
    .doc(token)
    .set({
      resourceLinkId: opts.resourceLinkId,
      contextId: opts.contextId,
      createdAt: now,
      expiresAtMs: now + PUSH_AUTH_TTL_MS,
      expiresAt: new Date(now + PUSH_AUTH_TTL_MS),
    });
  return token;
}

/** True iff the token exists, is unexpired, and is bound to this resource link. */
export async function validateGradePushAuth(
  db: Db,
  token: string,
  resourceLinkId: string
): Promise<boolean> {
  if (!token || !resourceLinkId) return false;
  const snap = await db.collection(LTI_PUSH_AUTH_COLLECTION).doc(token).get();
  if (!snap.exists) return false;
  const data = snap.data() as { resourceLinkId?: string; expiresAtMs?: number };
  if (isExpired(data)) return false;
  return data.resourceLinkId === resourceLinkId;
}
