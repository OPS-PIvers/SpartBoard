/**
 * List a teacher's active Google Classroom courses for a client-side picker.
 *
 * Extracted from the SidebarClasses "Link to Google Classroom" flow so the
 * dashboard "Assign to Google Classroom" modal reuses the exact same paginated
 * `courses.list` call (teacherId=me, ACTIVE only) — pages through every course,
 * time-boxes each request, and caps the loop so a buggy nextPageToken can't spin
 * unbounded. The caller supplies a `classroom.courses.readonly`-capable token.
 */

/** Minimal shape of a Google Classroom course the picker needs. */
export interface GoogleClassroomCourse {
  id: string;
  name: string;
  section?: string;
}

/** `courses.list` page size. */
const COURSES_PAGE_SIZE = 100;

/**
 * Runaway guard: a single teacher with >2500 active courses is implausible, so
 * this caps the loop — it is not an expected limit.
 */
const MAX_COURSE_PAGES = 25;

/**
 * Per-request timeout. Mirrors the server-side add-on CF `API_TIMEOUT_MS` so a
 * hung Classroom call surfaces a retryable error instead of pinning the picker's
 * loading spinner forever.
 */
const COURSES_API_TIMEOUT_MS = 10000;

/**
 * Fetch ALL of the token owner's ACTIVE courses (paginated). Throws an `Error`
 * with a user-presentable message on timeout or a non-2xx response; the caller
 * surfaces it as a retryable picker error.
 */
export async function listTeacherCourses(
  accessToken: string
): Promise<GoogleClassroomCourse[]> {
  const all: GoogleClassroomCourse[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const qs = new URLSearchParams({
      teacherId: 'me',
      courseStates: 'ACTIVE',
      pageSize: String(COURSES_PAGE_SIZE),
    });
    if (pageToken) qs.set('pageToken', pageToken);
    let res: Response;
    try {
      res = await fetch(
        `https://classroom.googleapis.com/v1/courses?${qs.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(COURSES_API_TIMEOUT_MS),
        }
      );
    } catch (fetchErr) {
      // AbortSignal.timeout rejects with a DOMException('TimeoutError') — which
      // isn't an `Error` in every engine — so match either type.
      if (
        (fetchErr instanceof DOMException || fetchErr instanceof Error) &&
        (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError')
      ) {
        throw new Error(
          'Timed out loading your Google Classroom courses. Please try again.'
        );
      }
      throw fetchErr;
    }
    if (!res.ok) {
      throw new Error(`Classroom API returned ${res.status}`);
    }
    const data = (await res.json()) as {
      courses?: GoogleClassroomCourse[];
      nextPageToken?: string;
    };
    for (const c of data.courses ?? []) all.push(c);
    pageToken = data.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_COURSE_PAGES);
  return all;
}
