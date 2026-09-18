/** Admin-curated `admin_settings/paper_answer_sheets` rollout switch for paper answer sheets. */

export const PAPER_ANSWER_SHEETS_SETTINGS_DOC = 'paper_answer_sheets';

export interface PaperAnswerSheetsSettings {
  /**
   * Surface the paper answer-sheet entry points. Ships OFF: the marker grid
   * and print fidelity are unproven on real copiers (plan §9), so the feature
   * stays invisible until an admin opts a pilot in, and flipping it back is
   * the kill switch.
   */
  enabled: boolean;
}

export const DEFAULT_PAPER_ANSWER_SHEETS_SETTINGS: PaperAnswerSheetsSettings = {
  enabled: false,
};

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizePaperAnswerSheetsSettings(
  raw: unknown
): PaperAnswerSheetsSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_PAPER_ANSWER_SHEETS_SETTINGS;
  }
  const enabled = (raw as { enabled?: unknown }).enabled;
  return { enabled: enabled === true };
}
