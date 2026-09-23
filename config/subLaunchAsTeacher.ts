/** Admin-curated `admin_settings/sub_launch_as_teacher` switch for substitute launching. */

export const SUB_LAUNCH_AS_TEACHER_SETTINGS_DOC = 'sub_launch_as_teacher';

export interface SubLaunchAsTeacherSettings {
  /**
   * Let a named substitute start a quiz, video activity, guided activity or
   * flashcard set in the teacher's own account, so the results land with the
   * teacher (plan D7, D14). Ships OFF in both projects: it is the one part of
   * substitute sharing where a Cloud Function writes on another user's behalf,
   * and flipping it back is the kill switch.
   */
  enabled: boolean;
}

export const DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS: SubLaunchAsTeacherSettings =
  { enabled: false };

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeSubLaunchAsTeacherSettings(
  raw: unknown
): SubLaunchAsTeacherSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS;
  }
  const enabled = (raw as { enabled?: unknown }).enabled;
  return { enabled: enabled === true };
}
