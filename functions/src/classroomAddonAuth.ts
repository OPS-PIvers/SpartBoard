/**
 * classroomAddonLoginV1 — SPIKE / de-risk slice for the Google Classroom
 * Add-on student handshake.
 *
 * Proves the riskiest part of the integration end-to-end:
 *   client (inside the Classroom student iframe) obtains a Google OAuth access
 *   token via a popup → this CF confirms, via `getAddOnContext`, that the
 *   launching user is a STUDENT on the attachment → mints a Firebase custom
 *   token carrying the SAME `{ studentRole, orgId, classIds }` claim shape as
 *   `studentLoginV1` / `pinLoginV1`, so the existing quiz/VA runners and the
 *   Firestore class-gate rules accept it unchanged.
 *
 * The authoritative trust anchor is `getAddOnContext` (NOT any query param and
 * NOT a launch JWT — Classroom Add-ons have no JWKS). `studentRole` is minted
 * ONLY when the response carries `studentContext`.
 *
 * SPIKE caveats (do NOT ship as-is — human review + hardening required):
 *   - No rate limiting (neither studentLoginV1 nor pinLoginV1 has one to copy).
 *   - Teacher launches are out of scope here: returns `{ role: 'teacher' }`
 *     with no token.
 *   - Helpers (hmac, email-domain→org) are inlined to keep the spike
 *     self-contained; production should share them with `index.ts`.
 *   - Outbound Google calls go through `classroomAddonNet` so unit tests can
 *     stub them without a live Classroom install. Uses raw `fetch` + Bearer
 *     (mirrors `getDriveHeaders` in index.ts) — no `googleapis` dependency.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as CryptoJS from 'crypto-js';

// Same named secret as index.ts; Firebase params dedupes by name.
const STUDENT_PSEUDONYM_HMAC_SECRET = defineSecret(
  'STUDENT_PSEUDONYM_HMAC_SECRET'
);

// Keep in sync with ALLOWED_ORIGINS in index.ts (spike duplication; production
// should import a shared constant).
const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://spartboard.web.app',
  'https://spartboard.firebaseapp.com',
  /^https:\/\/spartboard--[\w-]+\.web\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

const CLASSROOM_API = 'https://classroom.googleapis.com/v1';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
// Cap outbound Google calls so a slow/hung response can't pin the function.
const API_TIMEOUT_MS = 10000;

type ItemType = 'courseWork' | 'courseWorkMaterials' | 'announcements';

interface AddOnContext {
  courseId?: string;
  itemId?: string;
  supportsStudentWork?: boolean;
  studentContext?: { submissionId?: string };
  teacherContext?: Record<string, unknown>;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  hd?: string;
}

interface ClassroomAddonLoginData {
  accessToken?: unknown;
  courseId?: unknown;
  itemId?: unknown;
  itemType?: unknown;
}

function bearer(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function normalizeEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return '@' + email.slice(at + 1).toLowerCase();
}

/**
 * Looks up the org that owns an email domain — same query as index.ts's
 * `resolveOrgIdForDomain`. Domains are stored with a leading '@' and must be
 * `status === 'verified'`.
 */
async function resolveOrgIdForDomain(
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

function isItemType(v: unknown): v is ItemType {
  return (
    v === 'courseWork' || v === 'courseWorkMaterials' || v === 'announcements'
  );
}

/**
 * Seam for the two outbound Google calls. Exported as a mutable object so the
 * unit test can `vi.spyOn(classroomAddonNet, 'fetchAddOnContext')` without a
 * network or a live Classroom install.
 */
export const classroomAddonNet = {
  async fetchAddOnContext(
    accessToken: string,
    courseId: string,
    itemType: ItemType,
    itemId: string
  ): Promise<{ ok: boolean; status: number; context: AddOnContext | null }> {
    const url =
      `${CLASSROOM_API}/courses/${encodeURIComponent(courseId)}` +
      `/${itemType}/${encodeURIComponent(itemId)}/getAddOnContext`;
    try {
      const res = await fetch(url, {
        headers: bearer(accessToken),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, status: res.status, context: null };
      return {
        ok: true,
        status: res.status,
        context: (await res.json()) as AddOnContext,
      };
    } catch (err) {
      // Network failure / timeout / abort → treat as a failed launch
      // validation; the caller turns this into a clean 'unauthenticated'
      // error rather than an unhandled rejection.
      console.warn(
        '[classroomAddonLoginV1] getAddOnContext fetch failed:',
        err
      );
      return { ok: false, status: 0, context: null };
    }
  },

  async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
      const res = await fetch(USERINFO_URL, {
        headers: bearer(accessToken),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return (await res.json()) as GoogleUserInfo;
    } catch (err) {
      console.warn('[classroomAddonLoginV1] userinfo fetch failed:', err);
      return null;
    }
  },
};

export const classroomAddonLoginV1 = onCall(
  {
    memory: '256MiB',
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = (request.data ?? {}) as ClassroomAddonLoginData;
    const accessToken =
      typeof data.accessToken === 'string' ? data.accessToken : '';
    const courseId = typeof data.courseId === 'string' ? data.courseId : '';
    const itemId = typeof data.itemId === 'string' ? data.itemId : '';
    const itemType: ItemType = isItemType(data.itemType)
      ? data.itemType
      : 'courseWork';

    if (!accessToken) {
      throw new HttpsError('invalid-argument', 'accessToken is required.');
    }
    if (!courseId || !itemId) {
      throw new HttpsError(
        'invalid-argument',
        'courseId and itemId are required.'
      );
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!hmacSecret) {
      console.error('[classroomAddonLoginV1] Missing HMAC secret.');
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    // 1. Trust anchor: confirm the launch + role via getAddOnContext.
    const ctxResult = await classroomAddonNet.fetchAddOnContext(
      accessToken,
      courseId,
      itemType,
      itemId
    );
    if (!ctxResult.ok || !ctxResult.context) {
      // 401/403 → bad/expired access token; other non-2xx → bad launch.
      throw new HttpsError(
        'unauthenticated',
        'Could not validate the Classroom launch.'
      );
    }
    const ctx = ctxResult.context;
    const isTeacher = !!ctx.teacherContext;
    const isStudent = !!ctx.studentContext;
    const submissionId = ctx.studentContext?.submissionId ?? '';

    // Mint a studentRole token ONLY for a student launch. Never infer role
    // from a query param; a teacher who opens the student route gets no token.
    if (!isStudent) {
      return {
        role: isTeacher ? ('teacher' as const) : ('unknown' as const),
        studentRole: false,
      };
    }
    if (!submissionId) {
      // Student context without a submissionId shouldn't happen on the student
      // view; guard so we never key a response doc on an empty id.
      throw new HttpsError(
        'failed-precondition',
        'No submissionId in the student launch context.'
      );
    }

    // 2. Resolve org from the VERIFIED Google identity (read transiently from
    //    userinfo — never persisted; PII gate). Never trust a client-supplied
    //    email for the org gate.
    const info = await classroomAddonNet.fetchUserInfo(accessToken);
    if (!info || !info.sub || !info.email || info.email_verified === false) {
      throw new HttpsError(
        'unauthenticated',
        'Could not verify the Google identity.'
      );
    }
    const domain = info.hd
      ? '@' + info.hd.toLowerCase()
      : normalizeEmailDomain(info.email);
    if (!domain) {
      throw new HttpsError('unauthenticated', 'Malformed email.');
    }
    const db = admin.firestore();
    const orgId = await resolveOrgIdForDomain(db, domain);
    if (!orgId) {
      console.warn('[classroomAddonLoginV1] rejected_domain');
      throw new HttpsError(
        'permission-denied',
        'This SpartBoard is only available to schools that have signed up.'
      );
    }

    // 3. Deterministic per-student pseudonym from the stable Google subject id.
    //    Namespaced `classroom-sub:` so it can never collide with a ClassLink
    //    sourcedId-derived uid.
    const pseudonym = CryptoJS.HmacSHA256(
      `classroom-sub:${info.sub}`,
      hmacSecret
    ).toString(CryptoJS.enc.Hex);

    // 4. Mint the same claim shape as studentLoginV1 / pinLoginV1.
    let customToken: string;
    try {
      customToken = await admin.auth().createCustomToken(pseudonym, {
        studentRole: true,
        orgId,
        classIds: [`classroom:${courseId}`],
      });
    } catch (err) {
      console.error('[classroomAddonLoginV1] createCustomToken failed:', err);
      throw new HttpsError('internal', 'Failed to mint auth token.');
    }

    return {
      role: 'student' as const,
      studentRole: true,
      customToken,
      submissionId,
    };
  }
);
