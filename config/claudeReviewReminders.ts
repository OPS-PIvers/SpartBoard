/** Admin-curated `admin_settings/claude_review_reminders` switch for the "Review before assigning" mark on Claude-made items. */

export const CLAUDE_REVIEW_REMINDERS_SETTINGS_DOC = 'claude_review_reminders';

export interface ClaudeReviewRemindersSettings {
  /** On by default: an admin turns reminders off once teachers are used to reviewing. */
  enabled: boolean;
}

export const DEFAULT_CLAUDE_REVIEW_REMINDERS_SETTINGS: ClaudeReviewRemindersSettings =
  { enabled: true };

/** Fills a partial or malformed settings doc with the defaults; only an explicit false turns it off. */
export function normalizeClaudeReviewRemindersSettings(
  raw: unknown
): ClaudeReviewRemindersSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_CLAUDE_REVIEW_REMINDERS_SETTINGS;
  }
  return { enabled: (raw as { enabled?: unknown }).enabled !== false };
}
