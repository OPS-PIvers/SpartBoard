/** Admin-curated `admin_settings/gradebook_index` switch for the server-built gradebook index. */

export const GRADEBOOK_INDEX_SETTINGS_DOC = 'gradebook_index';

export interface GradebookIndexSettings {
  /** Lets the Cloud Functions build `grade_index` and `student_grades`; ships off in both projects. */
  enabled: boolean;
}

export const DEFAULT_GRADEBOOK_INDEX_SETTINGS: GradebookIndexSettings = {
  enabled: false,
};

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeGradebookIndexSettings(
  raw: unknown
): GradebookIndexSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_GRADEBOOK_INDEX_SETTINGS;
  return { enabled: (raw as { enabled?: unknown }).enabled === true };
}
