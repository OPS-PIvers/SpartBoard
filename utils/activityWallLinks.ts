// Single source of truth for every Activity Wall URL the teacher hands out.

/** Session id the widget mirrors to `activity_wall_sessions/{sessionId}`. */
export const activityWallSessionId = (
  teacherUid: string,
  activityId: string
): string => `${teacherUid}_${activityId}`;

/** Path a student lands on to post, before any sign-in routing. */
export const activityWallStudentPath = (sessionId: string): string =>
  `/activity-wall/${sessionId}`;

/** Link a teacher hands out: direct path for guest walls, else the SSO page. */
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
