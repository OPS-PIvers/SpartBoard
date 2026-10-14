/** Admin-curated `admin_settings/quiz_recording_notice` switch for the notice students read before a quiz recording. */

export const QUIZ_RECORDING_NOTICE_SETTINGS_DOC = 'quiz_recording_notice';

export interface QuizRecordingNoticeSettings {
  /** On by default: an admin turns the notice off org-wide. */
  enabled: boolean;
}

export const DEFAULT_QUIZ_RECORDING_NOTICE_SETTINGS: QuizRecordingNoticeSettings =
  { enabled: true };

/** Fills a partial or malformed settings doc with the defaults; only an explicit false turns it off. */
export function normalizeQuizRecordingNoticeSettings(
  raw: unknown
): QuizRecordingNoticeSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_QUIZ_RECORDING_NOTICE_SETTINGS;
  }
  return { enabled: (raw as { enabled?: unknown }).enabled !== false };
}
