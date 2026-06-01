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

/**
 * Grade-passback key store. Keyed by the student PSEUDONYM (HMAC uid), one
 * sub-doc per Classroom submission:
 *   `classroom_grade_links/{pseudonymUid}/submissions/{submissionId}`
 * Fields: { courseId, itemId, attachmentId, submissionId, teacherUid,
 * updatedAt } — all Classroom/Firebase ids, NEVER a name or email (PII gate).
 * Written transiently during the student handshake; read by
 * pushClassroomGradesForAssignment to resolve each student's submissionId
 * (and `teacherUid` to gate the push to the linking teacher).
 */
const GRADE_SYNC_COLLECTION = 'classroom_grade_links';

/** Default courseWork point value when the teacher doesn't supply one. */
const DEFAULT_MAX_POINTS = 100;

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
  // Full display name (present when the `userinfo.profile` scope is granted —
  // the student view requests it). Used ONLY as a transient watermark label,
  // returned to the student's own client; never persisted (PII gate).
  name?: string;
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

/**
 * Which student runner the attachment points at. `quiz` (default when absent)
 * → QuizStudentApp via `?code=`; `va` → VideoActivityStudentApp via
 * `?sessionId=`. Kept in sync with the routes agent's pinned contract.
 */
type RunnerKind = 'quiz' | 'va';

interface CreateAttachmentData {
  accessToken?: unknown;
  courseId?: unknown;
  itemId?: unknown;
  itemType?: unknown;
  addOnToken?: unknown;
  origin?: unknown;
  // Which runner the student view should open. Absent → 'quiz' (back-compat).
  kind?: unknown;
  // The join code of the teacher's quiz session; embedded in studentViewUri so
  // the student route hands it to QuizStudentApp (which SSO-auto-joins by code).
  // Required when kind === 'quiz' (or kind absent).
  quizCode?: unknown;
  // The Video Activity session id; embedded in studentViewUri so the student
  // route opens VideoActivityStudentApp. Required when kind === 'va'.
  sessionId?: unknown;
  // Display title for the Classroom attachment card (e.g. "SpartBoard: <quiz>").
  title?: unknown;
  // Optional grade-passback point value for the courseWork attachment. When >0
  // the attachment is created grade-sync capable (studentWorkReviewUri +
  // maxPoints); the DRAFT grade later populates via pushClassroomGrade.
  maxPoints?: unknown;
}

/**
 * `EmbedUri` view-URI objects + title, per addOnAttachments.create.
 *
 * Grade-sync fields (`studentWorkReviewUri` + `maxPoints`) are added together:
 * Classroom rejects `maxPoints` on an attachment that has no
 * `studentWorkReviewUri`. Both are optional so a non-graded attachment (e.g. a
 * material item that doesn't support student work) omits them entirely.
 */
interface AddOnAttachmentBody {
  title: string;
  teacherViewUri: { uri: string };
  studentViewUri: { uri: string };
  studentWorkReviewUri?: { uri: string };
  maxPoints?: number;
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
        // Lean diagnostic: the upstream status + which iframe token we sent is
        // enough to tell the failure modes apart (403 insufficient scope vs
        // Expired/InvalidAddOnToken vs 404 wrong item) without dumping Google's
        // full error body into logs.
        console.warn(
          `[classroomAddon] getAddOnContext ${res.status} ${itemType}/${itemId} ` +
            `(addOnToken=${addOnToken ? 'present' : 'absent'}, attachmentId=${
              attachmentId ? 'present' : 'absent'
            })`
        );
        return { ok: false, status: res.status, context: null };
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
        '[classroomAddon] getAddOnContext fetch failed (network/timeout):',
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

  /**
   * PATCH the DRAFT grade on an add-on student submission. This sets
   * `pointsEarned` on the add-on submission only (a DRAFT grade in Classroom) —
   * it does NOT publish to the gradebook, which is the safe, non-destructive
   * behavior: the teacher still reviews/returns. `updateMask=pointsEarned`
   * scopes the PATCH to that single field.
   */
  async patchStudentSubmissionGrade(
    accessToken: string,
    courseId: string,
    itemId: string,
    attachmentId: string,
    submissionId: string,
    pointsEarned: number
  ): Promise<{ ok: boolean; status: number }> {
    const url =
      `${CLASSROOM_API}/courses/${encodeURIComponent(courseId)}` +
      `/courseWork/${encodeURIComponent(itemId)}` +
      `/addOnAttachments/${encodeURIComponent(attachmentId)}` +
      `/studentSubmissions/${encodeURIComponent(submissionId)}` +
      `?updateMask=pointsEarned`;
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...bearer(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pointsEarned }),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(
          `[pushClassroomGrade] studentSubmissions.patch ${res.status} ` +
            `${courseId}/${itemId}/${attachmentId}/${submissionId}`
        );
        return { ok: false, status: res.status };
      }
      return { ok: true, status: res.status };
    } catch (err) {
      console.warn(
        '[pushClassroomGrade] studentSubmissions.patch failed:',
        err
      );
      return { ok: false, status: 0 };
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
      // 401/403 → bad/expired access token; other non-2xx → bad launch. The
      // upstream status is logged in fetchAddOnContext; surface it here too so
      // the failure mode is visible client-side.
      throw new HttpsError(
        'unauthenticated',
        `Could not validate the Classroom launch (getAddOnContext → ${ctxResult.status}).`
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
    // Transient display name for the results watermark. Roster-resolved name
    // (ClassLink givenName/familyName) is preferred; the Google userinfo name is
    // the fallback. Returned to the student's OWN client only — never persisted
    // (the claims + grade-sync key stay nameless, preserving the PII gate).
    let displayName: string | null = null;
    // The teacher who linked this course owns the OFFLINE Google creds the
    // grade-passback push uses. Captured here (PII-free — it's a Firebase uid)
    // so it can be persisted alongside the grade-sync key.
    let linkTeacherUid: string | null = null;
    try {
      const linkSnap = await db.doc(`classroom_course_links/${courseId}`).get();
      const link = linkSnap.exists ? (linkSnap.data() as CourseLink) : null;
      if (typeof link?.teacherUid === 'string' && link.teacherUid) {
        linkTeacherUid = link.teacherUid;
      }
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
          // Roster-resolved name for the watermark (transient; not persisted).
          const rosterName = [match.givenName, match.familyName]
            .filter((p): p is string => typeof p === 'string' && p.length > 0)
            .join(' ')
            .trim();
          if (rosterName) displayName = rosterName;
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
    // Fall back to the Google userinfo name when the roster bridge didn't
    // resolve one (unlinked course, or student not in the OneRoster roster).
    if (!displayName && typeof info.name === 'string') {
      displayName = info.name.trim() || null;
    }

    // 3b. Persist the PII-free grade-sync key so a later completion can push a
    //     DRAFT grade back to Classroom WITHOUT a teacher present. Keyed by the
    //     student PSEUDONYM (the HMAC uid that also keys the quiz response doc),
    //     one sub-doc per Classroom submission. Fields are all Classroom/Firebase
    //     ids — NO name or email is ever written here (the PII gate). Best-effort:
    //     a write failure must not block the student from taking the quiz.
    try {
      await db
        .doc(`${GRADE_SYNC_COLLECTION}/${uid}/submissions/${submissionId}`)
        .set(
          {
            courseId,
            itemId,
            attachmentId: attachmentId || null,
            submissionId,
            // Whoever linked the course owns the offline creds for the push.
            teacherUid: linkTeacherUid,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
    } catch (err) {
      console.warn(
        '[classroomAddonLoginV1] grade-sync key persist failed (non-fatal):',
        err
      );
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
      // Transient watermark label for the student's own results view. Omitted
      // when neither the roster nor userinfo yielded a name.
      ...(displayName ? { displayName } : {}),
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
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    const rawTitle = typeof data.title === 'string' ? data.title : '';
    const itemType: ItemType = isItemType(data.itemType)
      ? data.itemType
      : 'courseWork';
    // Runner discriminator: absent → 'quiz' (back-compat). Any value other than
    // the two known runners is rejected rather than silently treated as quiz.
    const kind: RunnerKind = data.kind === 'va' ? 'va' : 'quiz';
    if (data.kind !== undefined && data.kind !== 'quiz' && data.kind !== 'va') {
      throw new HttpsError('invalid-argument', "kind must be 'quiz' or 'va'.");
    }

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

    // Build the runner-specific content query shared by BOTH view URIs. Each
    // identifier is embedded verbatim into the stored URI, so each is
    // charset-constrained — never relay arbitrary client text into a stored URI.
    let contentQuery: string;
    if (kind === 'va') {
      // Video Activity session ids are SpartBoard-minted; allow the alnum + _-
      // charset Firestore session ids use.
      if (!sessionId || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
        throw new HttpsError(
          'invalid-argument',
          'sessionId is required and malformed for a video-activity attachment.'
        );
      }
      contentQuery = `kind=va&sessionId=${encodeURIComponent(sessionId)}`;
    } else {
      // Quiz: join codes are short uppercase alphanumerics. `code` is kept for
      // backward compatibility; `kind=quiz` is appended but non-load-bearing.
      if (!quizCode || !/^[A-Za-z0-9]{1,16}$/.test(quizCode)) {
        throw new HttpsError(
          'invalid-argument',
          'quizCode is missing or malformed.'
        );
      }
      contentQuery = `code=${encodeURIComponent(quizCode)}&kind=quiz`;
    }
    const studentViewUri = `${origin}/classroom-addon/student?${contentQuery}`;
    // The teacher view carries the SAME content ref so, when a teacher opens the
    // attachment, the iframe can resolve the session and render the grading view
    // in-place (no round-trip to the SpartBoard dashboard).
    const teacherViewUri = `${origin}/classroom-addon/teacher?${contentQuery}`;

    // Title is display-only; cap length and fall back to a sensible default.
    const title = (rawTitle || 'SpartBoard activity').slice(0, 200);

    // Grade-passback point value. Only courseWork items support graded student
    // work, so we only attach grade-sync fields for courseWork. A supplied
    // maxPoints must be a positive integer; otherwise default to 100. Coerce
    // with Number() first so a stringified number from a client (e.g. "20")
    // isn't silently dropped to the default (which would mismatch the scale).
    const coercedMaxPoints = Number(data.maxPoints);
    const suppliedMaxPoints =
      data.maxPoints !== undefined &&
      data.maxPoints !== null &&
      Number.isFinite(coercedMaxPoints) &&
      coercedMaxPoints > 0
        ? Math.floor(coercedMaxPoints)
        : DEFAULT_MAX_POINTS;

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
      // The upstream status is logged in fetchAddOnContext; surface it here too
      // so the failure mode (scope vs token vs item) is visible client-side.
      throw new HttpsError(
        'unauthenticated',
        `Could not validate the Classroom launch (getAddOnContext → ${ctxResult.status}).`
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
      teacherViewUri: { uri: teacherViewUri },
      studentViewUri: { uri: studentViewUri },
    };
    // Make the attachment grade-sync capable. `maxPoints` is invalid without
    // `studentWorkReviewUri`, so they're added together. The review URI is the
    // TEACHER grading route (same as teacherViewUri) — NOT the student view:
    // Classroom opens studentWorkReviewUri when a teacher clicks an individual
    // student's submitted work, so it must land on the grader, not the student
    // runner (which would see a teacher launch, mint no student token, and loop
    // back to the sign-in screen). Only courseWork supports graded student work.
    //
    // BOTH the quiz AND video-activity courseWork runners are grade-sync
    // capable: Classroom grade push is wired for each (the teacher monitor for
    // each runner drives pushClassroomGradesForAssignment), so each gradeable
    // slot is actually filled.
    if (itemType === 'courseWork') {
      body.studentWorkReviewUri = { uri: teacherViewUri };
      body.maxPoints = suppliedMaxPoints;
    }
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

    // The due date is intentionally NOT synced here. An add-on cannot set the
    // parent assignment's due date — Google restricts courses.courseWork.patch
    // to the developer project that CREATED the coursework, and add-on
    // attachments live under coursework the teacher created in Classroom's own
    // composer (→ PERMISSION_DENIED). The teacher sets the due date once, in
    // that composer (the screen this add-on iframe is embedded in).
    return { attachmentId: createResult.id };
  }
);

/** Defensive cap on the batch size — a class is ≤ ~40 students; 500 is generous. */
const MAX_BATCH_GRADES = 500;

interface BatchGradeEntryInput {
  pseudonymUid?: unknown;
  pointsEarned?: unknown;
}

interface PushBatchData {
  courseId?: unknown;
  itemId?: unknown;
  attachmentId?: unknown;
  // Fresh `classroom.addons.teacher` access token minted by the teacher's
  // monitor at push time. Used directly for the DRAFT-grade PATCH.
  accessToken?: unknown;
  grades?: unknown;
}

/** Per-entry outcome in the batch response. */
interface BatchGradeResult {
  pseudonymUid: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

/**
 * Resolve a student's Classroom `submissionId` from the persisted grade-sync
 * keys for ONE attachment. Queries
 * `classroom_grade_links/{pseudonymUid}/submissions` by `attachmentId` (the key
 * persisted during the student handshake), then verifies courseId/itemId on the
 * matched doc so a stale key from a different course/item can never be PATCHed.
 * Returns null when the student never opened the attachment (→ skip, don't
 * fail). PII-free: only ids are read.
 */
async function resolveSubmissionId(
  db: admin.firestore.Firestore,
  pseudonymUid: string,
  courseId: string,
  itemId: string,
  attachmentId: string
): Promise<string | null> {
  const snap = await db
    .collection(`${GRADE_SYNC_COLLECTION}/${pseudonymUid}/submissions`)
    .where('attachmentId', '==', attachmentId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const key = snap.docs[0].data() as {
    courseId?: string;
    itemId?: string;
    submissionId?: string;
  };
  // Guard against a stale/cross-item key sharing the same attachmentId value.
  if (key.courseId !== courseId || key.itemId !== itemId) return null;
  return typeof key.submissionId === 'string' && key.submissionId
    ? key.submissionId
    : null;
}

/**
 * pushClassroomGradesForAssignment — BATCH DRAFT-grade passback for one
 * Classroom-linked assignment. Called by the teacher's quiz / video-activity
 * monitor to publish every student's grade at once. The teacher is PRESENT (they
 * clicked "Push grades"), so the caller supplies a fresh `classroom.addons.teacher`
 * access token; this CF PATCHes the DRAFT grades with it directly. It resolves
 * each student's `submissionId` from the persisted grade-sync keys, then PATCHes
 * per student. A student who never opened the attachment is SKIPPED (no
 * submissionId) and a single upstream PATCH failure is recorded per-entry —
 * neither aborts the batch.
 *
 * (This replaces an earlier offline-token design that minted a STORED refresh
 * token server-side. That token was never provisioned by the normal sign-in or
 * Classroom-attach flows, so the push always failed with `needs-consent:
 * no-stored-token`. Since the teacher is present at push time, a live token is
 * both simpler and guaranteed to carry the add-on teacher scope.)
 *
 * Input (PII-free): { courseId, itemId, attachmentId, accessToken,
 *   grades: Array<{ pseudonymUid, pointsEarned }> }
 *
 * Security hardening: the caller MUST be the linking teacher. We read
 * `classroom_course_links/{courseId}` and require it exists AND
 * `request.auth.uid === link.teacherUid`. A missing link or a uid mismatch
 * (including an unauthenticated caller) → `permission-denied` — we deliberately
 * return the SAME error for "no link" and "wrong caller" so the response never
 * reveals whether a given course is linked. Only after this gate passes do we
 * issue any PATCH.
 */
export const pushClassroomGradesForAssignment = onCall(
  {
    memory: '256MiB',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = (request.data ?? {}) as PushBatchData;

    const courseId = typeof data.courseId === 'string' ? data.courseId : '';
    const itemId = typeof data.itemId === 'string' ? data.itemId : '';
    const attachmentId =
      typeof data.attachmentId === 'string' ? data.attachmentId : '';
    const accessToken =
      typeof data.accessToken === 'string' ? data.accessToken : '';

    if (!courseId || !itemId || !attachmentId) {
      throw new HttpsError(
        'invalid-argument',
        'courseId, itemId, and attachmentId are required.'
      );
    }
    if (!accessToken) {
      throw new HttpsError(
        'invalid-argument',
        'accessToken is required (the teacher add-on token to PATCH grades with).'
      );
    }
    if (!Array.isArray(data.grades) || data.grades.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'grades must be a non-empty array.'
      );
    }
    if (data.grades.length > MAX_BATCH_GRADES) {
      throw new HttpsError(
        'invalid-argument',
        `grades exceeds the maximum batch size of ${MAX_BATCH_GRADES}.`
      );
    }
    const rawGrades = data.grades as BatchGradeEntryInput[];

    const db = admin.firestore();

    // SECURITY GATE: the caller must be the teacher who linked this course.
    // Read the course link and require an exact uid match. A missing link OR a
    // mismatch (incl. unauthenticated) → permission-denied, BEFORE any token
    // mint or PATCH.
    const callerUid = request.auth?.uid ?? '';
    const linkSnap = await db.doc(`classroom_course_links/${courseId}`).get();
    const link = linkSnap.exists ? (linkSnap.data() as CourseLink) : null;
    const teacherUid =
      typeof link?.teacherUid === 'string' ? link.teacherUid : '';
    if (!teacherUid || !callerUid || callerUid !== teacherUid) {
      console.warn(
        `[pushClassroomGradesForAssignment] caller is not the linking teacher ` +
          `(course=${courseId}, linked=${teacherUid ? 'yes' : 'no'}).`
      );
      throw new HttpsError(
        'permission-denied',
        'Only the teacher who linked this Classroom course can push grades for it.'
      );
    }

    // The caller-supplied `accessToken` is the linking teacher's own fresh
    // `classroom.addons.teacher` token (minted by their monitor's GIS popup).
    // The security gate above already proved the caller IS that teacher, so we
    // PATCH with it directly — no stored/offline credential is involved.

    // Resolve + PATCH every student concurrently. Each entry has its own
    // try/catch so one student's failure —
    // or a student who never opened the attachment — is recorded per-entry and
    // never aborts the rest. Promise.all preserves input order, so `results`
    // lines up 1:1 with `grades`. MAX_BATCH_GRADES bounds the fan-out.
    const results: BatchGradeResult[] = await Promise.all(
      rawGrades.map(async (entry): Promise<BatchGradeResult> => {
        const pseudonymUid =
          typeof entry?.pseudonymUid === 'string' ? entry.pseudonymUid : '';
        const pointsEarnedRaw =
          typeof entry?.pointsEarned === 'number' ? entry.pointsEarned : NaN;

        if (!pseudonymUid) {
          return {
            pseudonymUid: '',
            ok: false,
            reason: 'missing pseudonymUid',
          };
        }
        if (!Number.isFinite(pointsEarnedRaw) || pointsEarnedRaw < 0) {
          return { pseudonymUid, ok: false, reason: 'invalid pointsEarned' };
        }
        const pointsEarned = Math.round(pointsEarnedRaw);

        try {
          const submissionId = await resolveSubmissionId(
            db,
            pseudonymUid,
            courseId,
            itemId,
            attachmentId
          );
          if (!submissionId) {
            // Student never opened the attachment → no Classroom submission to
            // grade. Skip, don't fail the batch.
            return {
              pseudonymUid,
              ok: false,
              reason: 'no matching submission',
            };
          }
          const patchResult =
            await classroomAddonNet.patchStudentSubmissionGrade(
              accessToken,
              courseId,
              itemId,
              attachmentId,
              submissionId,
              pointsEarned
            );
          return {
            pseudonymUid,
            ok: patchResult.ok,
            status: patchResult.status,
            ...(patchResult.ok ? {} : { reason: 'upstream PATCH failed' }),
          };
        } catch (err) {
          // A per-entry Firestore/lookup error must not abort the rest.
          console.warn(
            '[pushClassroomGradesForAssignment] entry failed (non-fatal):',
            err
          );
          return { pseudonymUid, ok: false, reason: 'lookup error' };
        }
      })
    );

    const pushed = results.filter((r) => r.ok).length;
    const skipped = results.length - pushed;
    return { results, pushed, skipped };
  }
);
