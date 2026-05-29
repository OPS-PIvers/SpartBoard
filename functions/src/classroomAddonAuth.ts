/**
 * Google Classroom Add-on SPIKE / de-risk slice. Two callables:
 *   - classroomAddonLoginV1 (student handshake → mints a studentRole token)
 *   - createClassroomAttachment (teacher discovery → creates an attachment)
 * They share the getAddOnContext trust anchor + the `classroomAddonNet` seam.
 *
 * classroomAddonLoginV1 — student handshake.
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
import axios from 'axios';
import OAuth from 'oauth-1.0a';

// Same named secrets as index.ts; Firebase params dedupes by name. The
// CLASSLINK_* secrets power the ClassLink identity bridge: a Classroom student
// is resolved to their OneRoster sourcedId so the minted uid matches their
// ClassLink SSO identity (HMAC("sid:"+sourcedId)) and the teacher monitor shows
// their real name — all PII-free (no name/email persisted).
const STUDENT_PSEUDONYM_HMAC_SECRET = defineSecret(
  'STUDENT_PSEUDONYM_HMAC_SECRET'
);
const CLASSLINK_CLIENT_ID = defineSecret('CLASSLINK_CLIENT_ID');
const CLASSLINK_CLIENT_SECRET = defineSecret('CLASSLINK_CLIENT_SECRET');
const CLASSLINK_TENANT_URL = defineSecret('CLASSLINK_TENANT_URL');

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

/** OneRoster student shape (subset) — mirrors index.ts's ClassLinkStudent. */
interface ClassLinkStudent {
  sourcedId?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}

/**
 * `/classroom_course_links/{googleCourseId}` — written by the teacher's
 * "Link to Google Classroom" action. Maps a Google Classroom course to the
 * ClassLink class (section) `sourcedId` so the add-on can resolve students
 * against the existing OneRoster roster + name pipeline.
 */
interface CourseLink {
  classlinkClassId?: string;
  classlinkOrgId?: string;
  teacherUid?: string;
}

interface ClassroomAddonLoginData {
  accessToken?: unknown;
  courseId?: unknown;
  itemId?: unknown;
  itemType?: unknown;
  // Present in the student/teacher VIEW iframes (not discovery); getAddOnContext
  // requires it for those launches.
  attachmentId?: unknown;
}

interface CreateAttachmentData {
  accessToken?: unknown;
  courseId?: unknown;
  itemId?: unknown;
  itemType?: unknown;
  addOnToken?: unknown;
  origin?: unknown;
  // The join code of the teacher's quiz session; embedded in studentViewUri so
  // the student route hands it to QuizStudentApp (which SSO-auto-joins by code).
  quizCode?: unknown;
  // Display title for the Classroom attachment card (e.g. "SpartBoard: <quiz>").
  title?: unknown;
}

/** `EmbedUri` view-URI objects + title, per addOnAttachments.create. */
interface AddOnAttachmentBody {
  title: string;
  teacherViewUri: { uri: string };
  studentViewUri: { uri: string };
}

function bearer(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function normalizeEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return '@' + email.slice(at + 1).toLowerCase();
}

const ONEROSTER_BASE = '/ims/oneroster/v1p1';

/**
 * Stable per-student pseudonym — MUST match index.ts `computeStudentUid`
 * (`HMAC("sid:"+sourcedId)`) so a Classroom student mints the SAME Firebase uid
 * as their ClassLink SSO login, and the existing `getPseudonymsForAssignmentV1`
 * monitor resolves their name. (Spike duplication; production should share it.)
 */
function computeStudentUid(sourcedId: string, hmacSecret: string): string {
  return CryptoJS.HmacSHA256(`sid:${sourcedId}`, hmacSecret).toString(
    CryptoJS.enc.Hex
  );
}

/** OAuth 1.0 headers for the ClassLink OneRoster API — mirrors index.ts. */
function getOAuthHeaders(
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

/** Validate a client-supplied origin against the same allowlist as CORS. */
function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.some((o) =>
    typeof o === 'string' ? o === origin : o.test(origin)
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
    itemId: string,
    addOnToken?: string,
    attachmentId?: string
  ): Promise<{
    ok: boolean;
    status: number;
    context: AddOnContext | null;
    errorBody?: string;
  }> {
    // REST path segment is `addOnContext` — the method is named getAddOnContext
    // but the `get` is the HTTP verb, not part of the path. A literal
    // `/getAddOnContext` returns a generic HTML 404 from Google's front end.
    const base =
      `${CLASSROOM_API}/courses/${encodeURIComponent(courseId)}` +
      `/${itemType}/${encodeURIComponent(itemId)}/addOnContext`;
    // Iframe-dependent query params: `addOnToken` is present ONLY in the
    // discovery / link-upgrade iframes; `attachmentId` is REQUIRED for every
    // other iframe (student view, teacher view, student-work review). Sending
    // neither yields a 400 "Attachment ID must be specified." Pass whichever
    // the caller has.
    const qs = new URLSearchParams();
    if (addOnToken) qs.set('addOnToken', addOnToken);
    if (attachmentId) qs.set('attachmentId', attachmentId);
    const query = qs.toString();
    const url = query ? `${base}?${query}` : base;
    try {
      const res = await fetch(url, {
        headers: bearer(accessToken),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!res.ok) {
        // [DEBUG-addonctx] The status code + Google's structured error body are
        // the only thing that distinguishes the failure modes (403 insufficient
        // scope vs Expired/InvalidAddOnToken vs 404 wrong item). The original
        // code discarded both, leaving "Could not validate the Classroom
        // launch" opaque. Capture them for the spike. TRIM before Phase 2.
        let errorBody = '';
        try {
          errorBody = (await res.text()).slice(0, 500);
        } catch {
          errorBody = '(could not read error body)';
        }
        console.warn(
          `[DEBUG-addonctx] getAddOnContext ${res.status} ` +
            `${itemType}/${itemId} addOnToken=${addOnToken ? 'present' : 'absent'}: ${errorBody}`
        );
        return { ok: false, status: res.status, context: null, errorBody };
      }
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
        '[DEBUG-addonctx] getAddOnContext fetch failed (network/timeout):',
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

  /**
   * Fetch a ClassLink class's students from OneRoster (district creds). Used by
   * the identity bridge to match a Classroom student's verified email →
   * sourcedId. Seam so tests can stub it without a live ClassLink call.
   */
  async fetchClassStudents(
    tenantUrl: string,
    clientId: string,
    clientSecret: string,
    classId: string
  ): Promise<ClassLinkStudent[]> {
    const cleanTenant = tenantUrl.replace(/\/$/, '');
    const url = `${cleanTenant}${ONEROSTER_BASE}/classes/${encodeURIComponent(
      classId
    )}/students`;
    const headers = getOAuthHeaders(url, {}, 'GET', clientId, clientSecret);
    const res = await axios.get<{ users?: ClassLinkStudent[] }>(url, {
      headers,
      timeout: API_TIMEOUT_MS,
    });
    return res.data.users ?? [];
  },

  async createAttachment(
    accessToken: string,
    courseId: string,
    itemType: ItemType,
    itemId: string,
    addOnToken: string,
    body: AddOnAttachmentBody
  ): Promise<{ ok: boolean; status: number; id: string | null }> {
    const url =
      `${CLASSROOM_API}/courses/${encodeURIComponent(courseId)}` +
      `/${itemType}/${encodeURIComponent(itemId)}/addOnAttachments` +
      `?addOnToken=${encodeURIComponent(addOnToken)}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...bearer(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, status: res.status, id: null };
      const json = (await res.json()) as { id?: string };
      return { ok: true, status: res.status, id: json.id ?? null };
    } catch (err) {
      console.warn(
        '[createClassroomAttachment] addOnAttachments create failed:',
        err
      );
      return { ok: false, status: 0, id: null };
    }
  },
};

export const classroomAddonLoginV1 = onCall(
  {
    memory: '256MiB',
    secrets: [
      STUDENT_PSEUDONYM_HMAC_SECRET,
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
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
    const attachmentId =
      typeof data.attachmentId === 'string' ? data.attachmentId : '';

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

    // 1. Trust anchor: confirm the launch + role via getAddOnContext. The
    //    student VIEW iframe carries an `attachmentId` (no addOnToken), and
    //    getAddOnContext requires it — forward it.
    const ctxResult = await classroomAddonNet.fetchAddOnContext(
      accessToken,
      courseId,
      itemType,
      itemId,
      undefined,
      attachmentId || undefined
    );
    if (!ctxResult.ok || !ctxResult.context) {
      // 401/403 → bad/expired access token; other non-2xx → bad launch.
      // [DEBUG-addonctx] surface the upstream status/body to the spike page.
      throw new HttpsError(
        'unauthenticated',
        `Could not validate the Classroom launch (getAddOnContext → ${ctxResult.status}${
          ctxResult.errorBody ? ': ' + ctxResult.errorBody.slice(0, 200) : ''
        }).`
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

    // 3. ClassLink identity bridge (best-effort). If this Google course is
    //    linked to a ClassLink class, resolve the student's OneRoster sourcedId
    //    by their VERIFIED email and mint the SAME uid as their ClassLink SSO
    //    login (HMAC("sid:"+sourcedId)) + the real ClassLink classId — so the
    //    existing getPseudonymsForAssignmentV1 monitor resolves their real name
    //    (still PII-free: email is used transiently, only the pseudonym
    //    persists). If anything is missing/unmatched, fall back to a Google-sub
    //    pseudonym scoped to the Google courseId — works, but nameless.
    let uid: string | null = null;
    let classIds: string[] = [`classroom:${courseId}`];
    try {
      const linkSnap = await db.doc(`classroom_course_links/${courseId}`).get();
      const link = linkSnap.exists ? (linkSnap.data() as CourseLink) : null;
      const tenantUrl = CLASSLINK_TENANT_URL.value();
      const clClientId = CLASSLINK_CLIENT_ID.value();
      const clClientSecret = CLASSLINK_CLIENT_SECRET.value();
      if (link?.classlinkClassId && tenantUrl && clClientId && clClientSecret) {
        const students = await classroomAddonNet.fetchClassStudents(
          tenantUrl,
          clClientId,
          clClientSecret,
          link.classlinkClassId
        );
        const emailLower = info.email.toLowerCase();
        const match = students.find(
          (s) => (s.email ?? '').toLowerCase() === emailLower
        );
        if (match?.sourcedId) {
          uid = computeStudentUid(match.sourcedId, hmacSecret);
          classIds = [link.classlinkClassId];
        } else {
          console.warn(
            '[classroomAddonLoginV1] linked course but student email not in ' +
              'OneRoster roster; falling back to nameless pseudonym.'
          );
        }
      }
    } catch (err) {
      // A bridge failure must NEVER block the student from taking the quiz —
      // fall back to the nameless pseudonym path.
      console.warn(
        '[classroomAddonLoginV1] ClassLink bridge failed; falling back:',
        err
      );
    }

    // Fallback: deterministic Google-sub pseudonym, namespaced `classroom-sub:`
    // so it can never collide with a ClassLink sourcedId-derived uid.
    if (!uid) {
      uid = CryptoJS.HmacSHA256(
        `classroom-sub:${info.sub}`,
        hmacSecret
      ).toString(CryptoJS.enc.Hex);
    }

    // 4. Mint the same claim shape as studentLoginV1 / pinLoginV1.
    let customToken: string;
    try {
      customToken = await admin.auth().createCustomToken(uid, {
        studentRole: true,
        orgId,
        classIds,
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

/**
 * createClassroomAttachment — teacher-discovery spike. Called from the
 * Attachment Setup (discovery) iframe with the teacher's OAuth access token.
 * Confirms via `getAddOnContext` that the launch is a TEACHER, then creates an
 * add-on attachment whose student/teacher view URIs point back at SpartBoard.
 * View URIs are derived from a SERVER-validated origin, never trusted blindly
 * from the client (mirrors the ALLOWED_ORIGINS gate).
 */
export const createClassroomAttachment = onCall(
  {
    memory: '256MiB',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = (request.data ?? {}) as CreateAttachmentData;
    const accessToken =
      typeof data.accessToken === 'string' ? data.accessToken : '';
    const courseId = typeof data.courseId === 'string' ? data.courseId : '';
    const itemId = typeof data.itemId === 'string' ? data.itemId : '';
    const addOnToken =
      typeof data.addOnToken === 'string' ? data.addOnToken : '';
    const origin = typeof data.origin === 'string' ? data.origin : '';
    const quizCode = typeof data.quizCode === 'string' ? data.quizCode : '';
    const rawTitle = typeof data.title === 'string' ? data.title : '';
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
    // The discovery iframe always carries an addOnToken; create needs it.
    if (!addOnToken) {
      throw new HttpsError('invalid-argument', 'addOnToken is required.');
    }
    // The view URIs are built from this origin, so it must be one of ours —
    // never relay an arbitrary client-supplied origin into a stored URI.
    if (!origin || !isAllowedOrigin(origin)) {
      throw new HttpsError('invalid-argument', 'origin is missing or invalid.');
    }
    // quizCode is embedded verbatim into the studentViewUri, so constrain it to
    // the join-code charset (alphanumeric) — never relay arbitrary text into a
    // stored URI. Join codes are short uppercase alphanumerics.
    if (!quizCode || !/^[A-Za-z0-9]{1,16}$/.test(quizCode)) {
      throw new HttpsError(
        'invalid-argument',
        'quizCode is missing or malformed.'
      );
    }
    // Title is display-only; cap length and fall back to a sensible default.
    const title = (rawTitle || 'SpartBoard activity').slice(0, 200);

    // Trust anchor: confirm the launch context (passing the addOnToken, which
    // is required in the discovery iframe).
    const ctxResult = await classroomAddonNet.fetchAddOnContext(
      accessToken,
      courseId,
      itemType,
      itemId,
      addOnToken
    );
    if (!ctxResult.ok || !ctxResult.context) {
      // [DEBUG-addonctx] surface the upstream status/body to the spike page so
      // the failure mode (scope vs token vs item) is visible without CF logs.
      throw new HttpsError(
        'unauthenticated',
        `Could not validate the Classroom launch (getAddOnContext → ${ctxResult.status}${
          ctxResult.errorBody ? ': ' + ctxResult.errorBody.slice(0, 200) : ''
        }).`
      );
    }
    // Only a TEACHER launch may create an attachment. Never infer role from a
    // query param; a student who reaches this route gets no attachment.
    if (!ctxResult.context.teacherContext) {
      throw new HttpsError(
        'permission-denied',
        ctxResult.context.studentContext
          ? 'Students cannot create Classroom attachments.'
          : 'Only a teacher launch can create a Classroom attachment.'
      );
    }

    const body: AddOnAttachmentBody = {
      title,
      teacherViewUri: { uri: `${origin}/classroom-addon/teacher` },
      studentViewUri: {
        uri: `${origin}/classroom-addon/student?code=${encodeURIComponent(quizCode)}`,
      },
    };
    const createResult = await classroomAddonNet.createAttachment(
      accessToken,
      courseId,
      itemType,
      itemId,
      addOnToken,
      body
    );
    if (!createResult.ok || !createResult.id) {
      console.error(
        '[createClassroomAttachment] create failed, status:',
        createResult.status
      );
      throw new HttpsError(
        'internal',
        'Failed to create the Classroom attachment.'
      );
    }

    return { attachmentId: createResult.id };
  }
);
