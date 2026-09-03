/**
 * Single source of truth for every Activity Wall URL the teacher hands out.
 *
 * The pre-redesign widget and the mobile remote each built their own
 * base64 `?data=` payload link, so a change to one silently broke the other.
 * Per docs/plans/ACTIVITY_WALL_REDESIGN.md "Routes" the payload link is gone:
 * an SSO-only wall routes through `/student/login?next=`, a guest wall goes
 * straight to `/activity-wall/{sessionId}`.
 */

/** Session id the widget mirrors to `activity_wall_sessions/{sessionId}`. */
export const activityWallSessionId = (
  teacherUid: string,
  activityId: string
): string => `${teacherUid}_${activityId}`;

/** Path a student lands on to post, before any sign-in routing. */
export const activityWallStudentPath = (sessionId: string): string =>
  `/activity-wall/${sessionId}`;

/**
 * The link a teacher copies or turns into a QR code. Guests allowed → direct
 * path; otherwise the student SSO page with the wall as its `next` target.
 */
export const buildStudentWallLink = (
  origin: string,
  sessionId: string,
  allowGuests: boolean
): string => {
  const path = activityWallStudentPath(sessionId);
  return allowGuests
    ? `${origin}${path}`
    : `${origin}/student/login?next=${encodeURIComponent(path)}`;
};

/** Full gallery URL a `short_links` code redirects to. */
export const buildGalleryLink = (origin: string, shareId: string): string =>
  `${origin}/activity-wall/gallery/${shareId}`;

/** Public `/r/<code>` form of a short link. */
export const buildShortLinkUrl = (origin: string, code: string): string =>
  `${origin}/r/${code}`;
