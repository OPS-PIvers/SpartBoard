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
 *   - Shared ClassLink helpers (hmac pseudonym, email-domain→org, OAuth
 *     headers, CORS allowlist, OneRoster base path) now live in
 *     `./classlinkShared` and are imported by both this file and `index.ts`.
 *   - Outbound Google calls go through `classroomAddonNet` so unit tests can
 *     stub them without a live Classroom install. Uses raw `fetch` + Bearer
 *     (mirrors `getDriveHeaders` in index.ts) — no `googleapis` dependency.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as CryptoJS from 'crypto-js';
import axios from 'axios';
import {
  ALLOWED_ORIGINS,
  ONEROSTER_BASE,
  computeStudentUid,
  getOAuthHeaders,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
  type ClassLinkStudent,
} from './classlinkShared';

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
 * Input to `linkClassroomCourse` (the SpartBoard dashboard "Link to Google
 * Classroom" flow). `accessToken` is the teacher's own
 * `classroom.courses.readonly` token — the SAME token that listed their courses
 * client-side — used here to RE-VERIFY teaching authority server-side.
 * `teacherUid` is intentionally absent: it's taken from `request.auth.uid`, not
 * the client, so a caller can never claim to be a different teacher.
 */
interface LinkClassroomCourseData {
  accessToken?: unknown;
  courseId?: unknown;
  classlinkClassId?: unknown;
  classlinkOrgId?: unknown;
  rosterId?: unknown;
}

/**
 * Input to `unlinkClassroomCourse` (the correction path for a wrong/stale
 * course→roster mapping). `accessToken` is the teacher's own
 * `classroom.courses.readonly` token — the SAME token that listed their courses
 * — used here to RE-VERIFY teaching authority server-side before any delete.
 * As with `linkClassroomCourse`, the caller's identity is taken from
 * `request.auth.uid`, never the client payload.
 */
interface UnlinkClassroomCourseData {
  accessToken?: unknown;
  courseId?: unknown;
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
   * Verify the access token's owner TEACHES a specific Google Classroom course
   * with a SINGLE `courses.teachers.get` call
   * (`GET /v1/courses/{courseId}/teachers/me`). This is the trust anchor for
   * `linkClassroomCourse`: Classroom returns 200 here ONLY when the
   * authenticated token owner is a teacher of `courseId`, proving teaching
   * authority that Firestore rules can't verify. Unlike a
   * `courses.list?courseStates=ACTIVE` enumeration, this is STATE-AGNOSTIC — a
   * teacher of an ACTIVE, ARCHIVED, or PROVISIONED course is verified the same
   * way — and costs exactly one API call instead of paging the teacher's whole
   * catalog.
   *
   * Return contract (the caller maps it to fail-closed semantics):
   *   - 200            → { ok: true,  status: 200, isTeacher: true }  (write allowed)
   *   - 404            → { ok: true,  status: 404, isTeacher: false } (definitively NOT a teacher)
   *   - other non-2xx / network / timeout
   *                    → { ok: false, status,      isTeacher: false } (UNVERIFIABLE → fail closed)
   *
   * `ok` means Classroom gave a DEFINITIVE teacher / not-a-teacher answer; only
   * 200 and 404 are definitive. A 401/403 (bad/expired/insufficient-scope
   * token), a 5xx, or a network failure is UNVERIFIABLE — never treat it as
   * "not a teacher" (the caller fails closed on it, never links). Seam so tests
   * can stub it without a live Classroom call.
   */
  async verifyTeacherOfCourse(
    accessToken: string,
    courseId: string
  ): Promise<{ ok: boolean; status: number; isTeacher: boolean }> {
    const url = `${CLASSROOM_API}/courses/${encodeURIComponent(
      courseId
    )}/teachers/me`;
    try {
      const res = await fetch(url, {
        headers: bearer(accessToken),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      // This is the one outbound call here that never reads its body (it
      // decides purely on the status code), so under Node's fetch (undici) the
      // socket would be held open until GC instead of returning to the pool.
      // Drain it on every path. Guarded for the unit-test fetch mocks, which
      // return a bare `{ ok, status }` with no `text`.
      if (typeof res.text === 'function') {
        await res.text();
      }
      // 2xx → the token owner is a teacher of this course.
      if (res.ok) {
        return { ok: true, status: res.status, isTeacher: true };
      }
      // 404 → the token owner is NOT a teacher of this course (or it doesn't
      // exist). Either way the caller must deny the link; this is a DEFINITIVE
      // answer, so `ok: true`.
      if (res.status === 404) {
        return { ok: true, status: 404, isTeacher: false };
      }
      // Everything else (401/403/5xx/…) is UNVERIFIABLE — the caller fails
      // closed on it rather than reading it as "not a teacher".
      console.warn(`[classroomAddon] verifyTeacherOfCourse ${res.status}`);
      return { ok: false, status: res.status, isTeacher: false };
    } catch (err) {
      // Network failure / timeout / abort → unverifiable; caller fails closed.
      console.warn(
        '[classroomAddon] verifyTeacherOfCourse fetch failed (network/timeout):',
        err
      );
      return { ok: false, status: 0, isTeacher: false };
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
          // Carry BOTH the ClassLink sourcedId (so the monitor name pipeline and
          // any regular-SSO roster-mate resolve against the same class) AND the
          // courseId-scoped id. The class-gate (firestore.rules) authorizes a
          // response when the session's classIds and the token's classIds
          // overlap; keeping `classroom:<courseId>` on every Classroom token
          // guarantees that overlap for ANY Classroom-verified course member —
          // even one the assignment targeted only by courseId (e.g. it was
          // attached before the course was linked) — honoring the "a bridge
          // failure must NEVER block the student" invariant below.
          classIds = [link.classlinkClassId, `classroom:${courseId}`];
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

/**
 * linkClassroomCourse — server-gated creator of
 * `classroom_course_links/{courseId}`, called from the SpartBoard dashboard's
 * "Link to Google Classroom" flow (NOT inside a Classroom iframe, so there's no
 * getAddOnContext launch to lean on — the trust anchor is a server-side
 * Classroom course-list check instead).
 *
 * WHY THIS EXISTS: the link doc maps a Google courseId → a ClassLink section,
 * and `classroomAddonLoginV1` mints every student's class-gate `classIds` from
 * whatever class this doc names. Firestore rules can only check
 * `teacherUid == auth.uid`; they CANNOT verify the caller actually teaches the
 * Google course. So a client `create` let any authed user squat ANY courseId
 * (first-write-wins → mis-route a victim course's students AND lock the real
 * teacher out, since `update` requires the existing teacherUid). The rules now
 * block client writes; this CF is the only writer.
 *
 * TRUST ANCHOR: a single server-side `courses.teachers.get` call
 * (`GET /courses/{courseId}/teachers/me`) with the caller's
 * `classroom.courses.readonly` token. Classroom returns 200 ONLY when the token
 * owner is a teacher of that exact course, so a forged/borrowed courseId yields
 * 404 → denied; this is state-agnostic (ACTIVE/ARCHIVED/PROVISIONED) and one
 * call rather than enumerating the teacher's whole catalog. Any non-200/404
 * outcome (401/403/5xx/network) is UNVERIFIABLE → fail closed (never link).
 * `teacherUid` is taken from `request.auth.uid` (never the client). An existing
 * link owned by a DIFFERENT teacher is never overwritten (`already-exists`),
 * preserving the no-hijack invariant.
 */
export const linkClassroomCourse = onCall(
  {
    memory: '256MiB',
    // Public IAM invoker like the other add-on callables: the Firebase Auth
    // check happens IN the callable framework (the ID token is in the request),
    // not at the IAM layer, so the endpoint must be reachable. Auth is still
    // enforced below — an unauthenticated caller is rejected before any work.
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = (request.data ?? {}) as LinkClassroomCourseData;

    // teacherUid comes from the authenticated caller, never the client payload.
    const callerUid = request.auth?.uid ?? '';
    if (!callerUid) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to link a class.'
      );
    }

    const accessToken =
      typeof data.accessToken === 'string' ? data.accessToken : '';
    const courseId = typeof data.courseId === 'string' ? data.courseId : '';
    if (!accessToken) {
      throw new HttpsError(
        'invalid-argument',
        'accessToken is required (your Google Classroom courses token).'
      );
    }
    if (!courseId) {
      throw new HttpsError('invalid-argument', 'courseId is required.');
    }
    // Link payload. classlinkClassId/OrgId are null for a roster with no
    // ClassLink linkage (it still links to the Google course by id); rosterId
    // ties the link back to the SpartBoard roster the teacher chose.
    const classlinkClassId =
      typeof data.classlinkClassId === 'string' ? data.classlinkClassId : null;
    const classlinkOrgId =
      typeof data.classlinkOrgId === 'string' ? data.classlinkOrgId : null;
    const rosterId = typeof data.rosterId === 'string' ? data.rosterId : null;

    // TRUST ANCHOR: prove the caller teaches this Google course with a single
    // courses.teachers.get call. Fail CLOSED on any UNVERIFIABLE outcome
    // (network/timeout/401/403/5xx) — never link on a token we couldn't get a
    // definitive answer for.
    const verification = await classroomAddonNet.verifyTeacherOfCourse(
      accessToken,
      courseId
    );
    if (!verification.ok) {
      throw new HttpsError(
        'unauthenticated',
        `Could not verify that you teach this Google Classroom course (status ${verification.status}).`
      );
    }
    if (!verification.isTeacher) {
      // 404 → the caller is DEFINITIVELY not a teacher of this course. Opaque on
      // purpose: don't reveal whether the course exists to someone who doesn't
      // teach it.
      console.warn(
        `[linkClassroomCourse] uid=${callerUid} is not a teacher of course ${courseId}.`
      );
      throw new HttpsError(
        'permission-denied',
        'You can only link a Google Classroom course that you teach.'
      );
    }

    const db = admin.firestore();
    const ref = db.doc(`classroom_course_links/${courseId}`);

    // TOCTOU FIX: run the no-hijack check + write inside a single transaction.
    // The old read-then-write was not atomic, so two co-teachers clicking "Link"
    // on the SAME never-linked course within the same window could BOTH pass the
    // "exists?" check and write (last-writer-wins). It was benign (both racers
    // still cleared teacher-verification above, so a non-teaching squatter could
    // never win — it only decided which authorized co-teacher owned the link),
    // but the transaction makes it deterministic: the read locks the doc, so the
    // first writer commits the create and the second's read now sees it and is
    // either merged (same teacher) or rejected with `already-exists` (a different
    // teacher). Teacher verification stays OUTSIDE the transaction — it's a
    // network call, and the transaction body may be retried on contention.
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        const prior = existing.data() as CourseLink;
        if (
          typeof prior?.teacherUid === 'string' &&
          prior.teacherUid &&
          prior.teacherUid !== callerUid
        ) {
          // A co-teacher may also genuinely teach this course, but silently
          // re-pointing an existing link would re-route the original teacher's
          // students. Preserve the no-hijack invariant — the EXPLICIT correction
          // path for a stale/wrong link is `unlinkClassroomCourse`.
          console.warn(
            `[linkClassroomCourse] course ${courseId} already linked by a ` +
              `different teacher; refusing to overwrite.`
          );
          throw new HttpsError(
            'already-exists',
            'This Google Classroom course is already linked by another teacher.'
          );
        }
      }

      // Admin SDK write — bypasses the now read-only client rules. createdAt is
      // set only on first create; merge:true preserves it (and any other fields)
      // on a same-teacher re-link (e.g. the owner correcting the rosterId).
      const payload: Record<string, unknown> = {
        classlinkClassId,
        classlinkOrgId,
        teacherUid: callerUid,
        rosterId,
        updatedAt: Date.now(),
      };
      if (!existing.exists) payload.createdAt = Date.now();
      tx.set(ref, payload, { merge: true });
    });

    return { ok: true, courseId };
  }
);

/**
 * unlinkClassroomCourse — server-gated REMOVER of
 * `classroom_course_links/{courseId}`, the correction path the squatting fix
 * deliberately left out. The rules block client deletes and there was no delete
 * CF, so a wrong mapping (a wrong `rosterId`, or a teacher who LEFT the district)
 * was permanent without direct Firestore Console access — and
 * `linkClassroomCourse`'s `already-exists` guard blocks even a legitimate
 * co-teacher from re-pointing it. This CF clears the link so it can be recreated
 * cleanly through `linkClassroomCourse` (which then stamps a fresh owner). The
 * common "wrong rosterId, same teacher" fix doesn't even need this — the owner
 * just re-links the correct roster (the same-teacher merge updates `rosterId`).
 *
 * TRUST ANCHOR: identical to `linkClassroomCourse` — re-run the caller's OWN
 * `courses?teacherId=me` query server-side with their
 * `classroom.courses.readonly` token. Only a VERIFIED teacher of the Google
 * course may unlink it; any upstream/verification error fails CLOSED (never
 * deletes on an unverifiable token). `request.auth.uid` is the only identity
 * source. Never a client-direct delete.
 *
 * CO-TEACHER TAKEOVER — DOCUMENTED DECISION: a verified teacher of the course
 * who is NOT the current owner (e.g. cleaning up after a colleague left the
 * district) IS permitted to remove the link. This is the deliberate escape
 * hatch the `linkClassroomCourse` no-hijack guard intentionally lacks, and it's
 * safe because:
 *   - it is still gated on SERVER-side teaching verification, so a non-teacher
 *     can NEVER reach the delete (the squatting-fix invariant holds);
 *   - removal is an EXPLICIT, destructive action on the SAME course the caller
 *     provably teaches — NOT a silent re-point during the normal link flow; and
 *   - it only DELETES; it never assigns ownership to the caller. Re-linking goes
 *     back through `linkClassroomCourse`, which re-runs verification and stamps a
 *     fresh `teacherUid`.
 * Each takeover (a different teacher's link being removed) is logged for the
 * audit trail. Restricting unlink to the owner ONLY would re-create the exact
 * "permanent stale link after a teacher leaves" gap this CF exists to close.
 */
export const unlinkClassroomCourse = onCall(
  {
    memory: '256MiB',
    // Same public-IAM rationale as linkClassroomCourse: the Firebase Auth check
    // runs in the callable framework, not at IAM; auth is still enforced below.
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = (request.data ?? {}) as UnlinkClassroomCourseData;

    // Identity comes from the authenticated caller, never the client payload.
    const callerUid = request.auth?.uid ?? '';
    if (!callerUid) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to unlink a class.'
      );
    }

    const accessToken =
      typeof data.accessToken === 'string' ? data.accessToken : '';
    const courseId = typeof data.courseId === 'string' ? data.courseId : '';
    if (!accessToken) {
      throw new HttpsError(
        'invalid-argument',
        'accessToken is required (your Google Classroom courses token).'
      );
    }
    if (!courseId) {
      throw new HttpsError('invalid-argument', 'courseId is required.');
    }

    // TRUST ANCHOR: prove the caller teaches this Google course. Fail CLOSED on
    // any upstream error (never unlink on an unverifiable token).
    const teacherCourses =
      await classroomAddonNet.listTeacherCourseIds(accessToken);
    if (!teacherCourses.ok) {
      throw new HttpsError(
        'unauthenticated',
        `Could not verify your Google Classroom courses (status ${teacherCourses.status}).`
      );
    }
    if (!teacherCourses.courseIds.includes(courseId)) {
      // Opaque on purpose: don't reveal whether the course exists to someone who
      // doesn't teach it.
      console.warn(
        `[unlinkClassroomCourse] uid=${callerUid} is not a teacher of course ${courseId}.`
      );
      throw new HttpsError(
        'permission-denied',
        'You can only unlink a Google Classroom course that you teach.'
      );
    }

    const db = admin.firestore();
    const ref = db.doc(`classroom_course_links/${courseId}`);

    // Transactional read-then-delete so the removal is deterministic against a
    // concurrent link/unlink, and so we report whether a doc was actually
    // cleared. Idempotent: a missing link is a no-op (`removed: false`), never an
    // error — a double-click or stale UI shouldn't surface a failure.
    const removed = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (!existing.exists) return false;
      const prior = existing.data() as CourseLink;
      const priorUid =
        typeof prior?.teacherUid === 'string' ? prior.teacherUid : '';
      if (priorUid && priorUid !== callerUid) {
        // Co-teacher takeover (see the documented decision above): a DIFFERENT
        // verified teacher of the SAME course is removing the link. Logged for
        // the audit trail.
        console.warn(
          `[unlinkClassroomCourse] course ${courseId} link owned by ` +
            `${priorUid} removed by verified co-teacher ${callerUid}.`
        );
      }
      tx.delete(ref);
      return true;
    });

    return { ok: true, courseId, removed };
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
  // Optional grade scale (the attachment's frozen maxPoints). When present, the
  // server clamps each pointsEarned to [0, maxPoints] as defense-in-depth
  // against a BUGGY client. The caller is the authorized teacher and supplies
  // both the points and this bound, so it is NOT a trust boundary — just a
  // sanity cap mirroring the client-side clamp in buildQuizClassroomGradeEntries.
  maxPoints?: unknown;
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

    // Optional server-side clamp bound (defense-in-depth; see PushBatchData).
    // Absent/invalid → no upper clamp (Number.POSITIVE_INFINITY).
    const coercedMaxPoints = Number(data.maxPoints);
    const maxPointsCap =
      data.maxPoints !== undefined &&
      data.maxPoints !== null &&
      Number.isFinite(coercedMaxPoints) &&
      coercedMaxPoints > 0
        ? Math.floor(coercedMaxPoints)
        : Number.POSITIVE_INFINITY;

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
        // Clamp to the attachment scale when supplied (no-op when unbounded).
        const pointsEarned = Math.min(
          maxPointsCap,
          Math.round(pointsEarnedRaw)
        );

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
    // A "skip" is the BENIGN case: the student never opened the attachment, so
    // there's no Classroom submission to grade against. Everything else that
    // isn't `ok` (an upstream PATCH error, a lookup error, a malformed entry) is
    // a real FAILURE the teacher should retry — never fold those into the
    // "not opened yet" count, which would report a failed push as a success.
    const skipped = results.filter(
      (r) => !r.ok && r.reason === 'no matching submission'
    ).length;
    const failed = results.length - pushed - skipped;
    return { results, pushed, skipped, failed };
  }
);
