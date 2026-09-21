/** Admin-curated `admin_settings/quiz_document_import` rollout switch for importing a quiz from a test document. */

export const QUIZ_DOCUMENT_IMPORT_SETTINGS_DOC = 'quiz_document_import';

export interface QuizDocumentImportSettings {
  /**
   * Surface the "Test document" import source and let a document reader fill
   * paper stubs (plan D21). Ships OFF: a misread key is worse than no import
   * at all, so the feature stays invisible until an admin opts a pilot in.
   */
  enabled: boolean;
}

export const DEFAULT_QUIZ_DOCUMENT_IMPORT_SETTINGS: QuizDocumentImportSettings =
  {
    enabled: false,
  };

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeQuizDocumentImportSettings(
  raw: unknown
): QuizDocumentImportSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_QUIZ_DOCUMENT_IMPORT_SETTINGS;
  }
  const enabled = (raw as { enabled?: unknown }).enabled;
  return { enabled: enabled === true };
}
