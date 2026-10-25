/** Admin-curated `admin_settings/student_context_menu` switch that turns off the right-click menu on student pages. */

export const STUDENT_CONTEXT_MENU_SETTINGS_DOC = 'student_context_menu';

export interface StudentContextMenuSettings {
  /** Off by default: an admin turns the block on org-wide. */
  enabled: boolean;
}

export const DEFAULT_STUDENT_CONTEXT_MENU_SETTINGS: StudentContextMenuSettings =
  { enabled: false };

/** Only an explicit true turns the block on. */
export function normalizeStudentContextMenuSettings(
  raw: unknown
): StudentContextMenuSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_STUDENT_CONTEXT_MENU_SETTINGS;
  }
  return { enabled: (raw as { enabled?: unknown }).enabled === true };
}

const STUDENT_PATH_PREFIXES = [
  '/join',
  '/quiz',
  '/nextup',
  '/activity',
  '/activity-wall',
  '/poll',
  '/flashcards/a',
  '/student/login',
  '/my-assignments',
  '/project',
  '/guided-learning',
  '/miniapp',
  '/classroom-addon/student',
  '/lti/student',
];

/** True on the pages students use; the Activity Wall gallery and public flashcard snapshots stay out. */
export function isStudentFacingPath(pathname: string): boolean {
  if (pathname.startsWith('/activity-wall/gallery/')) return false;
  return STUDENT_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
