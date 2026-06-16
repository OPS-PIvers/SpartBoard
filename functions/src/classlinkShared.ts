/**
 * classlinkShared — single source of truth for the ClassLink / OneRoster + CORS
 * primitives that `index.ts` and `classroomAddonAuth.ts` both depend on.
 *
 * These were previously copy-pasted into each file with "keep in sync" / "MUST
 * match index.ts" comments. The riskiest of them is `computeStudentUid`: it is
 * the HMAC pseudonym CONTRACT. A Classroom add-on student and that same student's
 * ClassLink SSO login must mint the IDENTICAL Firebase uid, or the monitor's name
 * resolution and grade passback silently target the wrong (or no) student — with
 * NO compile error to catch the drift. Centralizing the formula here makes that
 * contract un-driftable.
 *
 * No Firebase Admin app is initialized in this module (only `index.ts` calls
 * `admin.initializeApp()`); `resolveOrgIdForDomain` receives the Firestore handle
 * from its caller so this stays a pure, import-anywhere helper module.
 */
import * as admin from 'firebase-admin';
import * as CryptoJS from 'crypto-js';
import OAuth from 'oauth-1.0a';

/**
 * CORS allowlist + per-callable `cors` config shared by every onCall in both
 * files. Production host, Firebase default host, the dev-channel preview pattern,
 * and localhost. (Previously duplicated as `ALLOWED_ORIGINS` in each file with a
 * "Keep in sync" comment.)
 */
export const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://spartboard.web.app',
  'https://spartboard.firebaseapp.com',
  /^https:\/\/spartboard--[\w-]+\.web\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

/** OneRoster v1.1 API base path segment (appended to a tenant URL). */
export const ONEROSTER_BASE = '/ims/oneroster/v1p1';

/**
 * OneRoster student shape (subset). Fields are optional because a OneRoster
 * `users`/`students` payload can omit any of them — every consumer guards
 * (`if (!s.sourcedId) continue`, `s.email ?? ''`) before use.
 */
export interface ClassLinkStudent {
  sourcedId?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}

/**
 * OneRoster class shape (subset). Mirrors the canonical `ClassLinkClass` in the
 * repo-root `types.ts` (which adds an optional `subject?`). Kept as a
 * functions-local single source rather than imported from root: pulling the
 * root `.ts` into the `functions/` compilation makes `tsc` emit a stray root
 * `types.js`, which would shadow `types.ts` under Vite's `.js`-before-`.ts`
 * resolution. If a field is added to the root type and functions needs it,
 * mirror it here.
 */
export interface ClassLinkClass {
  sourcedId: string;
  title: string;
  classCode?: string;
  subject?: string;
}

/**
 * OneRoster teacher/user shape (subset) used when looking a caller up in
 * ClassLink by email. Single source of truth for both `index.ts` (which used
 * to declare its own copy) and the `OneRosterUserWithRole` extension. Unlike
 * `ClassLinkStudent` these fields are required because the consuming code only
 * ever reads them off the first matched `users[0]` after a successful filter
 * lookup, where OneRoster always returns the core identity fields.
 *
 * NOTE: deliberately NOT imported from the repo-root `types.ts` — root does
 * not define a `ClassLinkUser`, and this OneRoster-API shape is a
 * functions-only concern, so `classlinkShared.ts` (the existing ClassLink
 * single-source module) is its correct home.
 */
export interface ClassLinkUser {
  sourcedId: string;
  email: string;
  givenName: string;
  familyName: string;
}

/**
 * Stable per-student pseudonym: `HMAC-SHA256("sid:"+sourcedId, secret)` in hex.
 * THE pseudonym contract — see the module header. Must produce the byte-identical
 * uid for a given (sourcedId, secret) across every caller.
 */
export function computeStudentUid(
  sourcedId: string,
  hmacSecret: string
): string {
  return CryptoJS.HmacSHA256(`sid:${sourcedId}`, hmacSecret).toString(
    CryptoJS.enc.Hex
  );
}

/**
 * Rejects emails that would break (or be injected into) an unquoted
 * OneRoster `filter=email='...'` string. Real Google-verified school emails
 * never contain `'` or `\`, so callers short-circuit to the standard
 * "not in roster" path rather than disclosing the guard's existence.
 *
 * Shared by `getClassLinkRosterV1` (classlinkRoster.ts) and the student
 * identity callables (studentIdentity.ts) — kept here, the ClassLink
 * single-source module, so the two never drift.
 */
export function isSafeEmailForOneRosterFilter(email: string): boolean {
  return !/['\\]/.test(email);
}

/**
 * Normalize an email to its `@domain` form (lowercased, leading '@'), or null
 * when the address is malformed. Matches the domain-doc storage format.
 */
export function normalizeEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return '@' + email.slice(at + 1).toLowerCase();
}

/**
 * Look up the organization that owns an email domain. Matches the
 * `/organizations/{orgId}/domains/{doc}` subcollection, requiring
 * `status === 'verified'`. Domain values are stored with a leading '@'. Returns
 * null when no verified match exists.
 */
export async function resolveOrgIdForDomain(
  db: admin.firestore.Firestore,
  domainWithAt: string
): Promise<string | null> {
  const snap = await db
    .collectionGroup('domains')
    .where('domain', '==', domainWithAt)
    .where('status', '==', 'verified')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const orgRef = snap.docs[0].ref.parent.parent;
  return orgRef ? orgRef.id : null;
}

/** Generate OAuth 1.0 (HMAC-SHA1) headers for a ClassLink OneRoster request. */
export function getOAuthHeaders(
  baseUrl: string,
  params: Record<string, string>,
  method: string,
  clientId: string,
  clientSecret: string
): Record<string, string> {
  const oauth = new OAuth({
    consumer: { key: clientId, secret: clientSecret },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string: string, key: string) {
      return CryptoJS.HmacSHA1(base_string, key).toString(CryptoJS.enc.Base64);
    },
  });
  return oauth.toHeader(
    oauth.authorize({ url: baseUrl, method, data: params })
  ) as unknown as Record<string, string>;
}
