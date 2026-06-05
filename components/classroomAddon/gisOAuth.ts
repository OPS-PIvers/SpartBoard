/**
 * Shared Google Identity Services (GIS) OAuth helpers for the Classroom Add-on
 * flows: the student handshake + teacher discovery pages, AND the teacher-
 * initiated grade push from the quiz / video-activity monitor
 * (`requestClassroomTeacherToken`). Extracted so callers don't duplicate the
 * popup plumbing.
 *
 * OAuth consent CANNOT redirect inside Classroom's iframe, so we use the GIS
 * token popup (top-level) to obtain an access token.
 */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** Inject the GIS script once and resolve when `google.accounts.oauth2` is ready. */
export function ensureGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Not in a browser.'));
      return;
    }
    const ready = () =>
      typeof window.google !== 'undefined' && !!window.google.accounts?.oauth2;
    if (ready()) {
      resolve();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`
    );
    if (!script) {
      script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const deadline = Date.now() + 8000;
    const poll = window.setInterval(() => {
      if (ready()) {
        window.clearInterval(poll);
        resolve();
      } else if (Date.now() > deadline) {
        window.clearInterval(poll);
        reject(new Error('GIS script did not load.'));
      }
    }, 100);
  });
}

/**
 * Run the OAuth token popup for the given scope string, resolving with an
 * access token (or rejecting). `loginHint` pre-selects the launching account.
 */
export function requestAccessToken(
  scope: string,
  loginHint: string | undefined
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID is not set in this build.'));
      return;
    }
    // `hint` / `error_callback` aren't in older @types/google.accounts; widen
    // the config type. `error_callback` rejects on popup failures (blocked,
    // closed before consent) so the caller's promise settles instead of hanging.
    const init = window.google.accounts.oauth2.initTokenClient as (config: {
      client_id: string;
      scope: string;
      hint?: string;
      callback: (resp: { access_token?: string; error?: string }) => void;
      error_callback?: (err: { type?: string; message?: string }) => void;
    }) => { requestAccessToken: () => void };

    const client = init({
      client_id: CLIENT_ID,
      scope,
      hint: loginHint,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`OAuth error: ${resp.error}`));
          return;
        }
        if (!resp.access_token) {
          reject(new Error('No access token returned.'));
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(
          new Error(
            `OAuth popup failed: ${err?.type ?? err?.message ?? 'unknown'}`
          )
        );
      },
    });
    client.requestAccessToken();
  });
}

/**
 * The single OAuth scope required to PATCH add-on student-submission grades
 * (`addOnAttachments.studentSubmissions.patch`). The teacher-initiated grade
 * push obtains a fresh access token for just this scope. (TeacherDiscoveryRoute
 * requests the same scope alongside openid/email/profile when CREATING the
 * attachment; pushing grades only needs the add-on teacher scope itself.)
 */
export const CLASSROOM_ADDON_TEACHER_SCOPE =
  'https://www.googleapis.com/auth/classroom.addons.teacher';

/**
 * Obtain a fresh `classroom.addons.teacher` access token for a teacher-initiated
 * grade push from the quiz / video-activity monitor. The teacher is present (they
 * clicked "Push grades"), so the live token replaces the older server-side offline
 * mint — which required an offline refresh token that the normal sign-in / attach
 * flows never provisioned. Ensures GIS is loaded, then runs the token popup.
 * Rejects if the popup fails or the user dismisses consent. `loginHint`
 * pre-selects the signed-in teacher's Google account.
 */
export async function requestClassroomTeacherToken(
  loginHint?: string
): Promise<string> {
  await ensureGis();
  return requestAccessToken(CLASSROOM_ADDON_TEACHER_SCOPE, loginHint);
}

/** Read-only Google Classroom course listing (the dashboard course picker). */
export const CLASSROOM_COURSES_READONLY_SCOPE =
  'https://www.googleapis.com/auth/classroom.courses.readonly';

/**
 * RESTRICTED scope required to CREATE the parent courseWork in the partner-first
 * "Assign to Google Classroom" flow (`courses.courseWork.create`/`.patch`).
 *
 * ⚠️ This scope MUST be declared on the Workspace Marketplace listing before it
 * is ever requested in prod — an undeclared restricted scope reproduces the
 * org-wide "Account Restricted" sign-in outage. The only caller
 * (`requestClassroomAssignToken`) sits behind the CLASSROOM_ASSIGN_ENABLED flag.
 */
export const CLASSROOM_COURSEWORK_STUDENTS_SCOPE =
  'https://www.googleapis.com/auth/classroom.coursework.students';

/**
 * Obtain the combined token for the dashboard assign flow in a SINGLE consent
 * popup: list the teacher's courses (courses.readonly), check add-on eligibility
 * + create the add-on attachment (addons.teacher), and create the parent
 * courseWork (coursework.students — the new restricted scope). Used only by the
 * flag-gated "Assign to Google Classroom" action. `loginHint` pre-selects the
 * signed-in teacher's account.
 */
export async function requestClassroomAssignToken(
  loginHint?: string
): Promise<string> {
  await ensureGis();
  const scope = [
    CLASSROOM_COURSES_READONLY_SCOPE,
    CLASSROOM_ADDON_TEACHER_SCOPE,
    CLASSROOM_COURSEWORK_STUDENTS_SCOPE,
  ].join(' ');
  return requestAccessToken(scope, loginHint);
}

/**
 * Obtain a token for the FINAL-grade push ("Publish = Push"). The CF sets the
 * parent courseWork submission's assignedGrade + returns it
 * (`courses.courseWork.studentSubmissions.list`/`.patch`/`.return`), all covered
 * by `classroom.coursework.students` — the SAME restricted scope the assign flow
 * already declares + requests (no new Marketplace declaration). Distinct from
 * `requestClassroomTeacherToken` (the add-on DRAFT path), which only needs
 * `classroom.addons.teacher`. Must be called from a user gesture (the Publish
 * click) so the popup isn't blocked. `loginHint` pre-selects the teacher.
 */
export async function requestClassroomFinalGradeToken(
  loginHint?: string
): Promise<string> {
  await ensureGis();
  return requestAccessToken(CLASSROOM_COURSEWORK_STUDENTS_SCOPE, loginHint);
}
