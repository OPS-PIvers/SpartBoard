/** Admin-curated `admin_settings/plc_delegated_printing` rollout switch for printing a teammate's sheets. */

export const PLC_DELEGATED_PRINTING_SETTINGS_DOC = 'plc_delegated_printing';

export interface PlcDelegatedPrintingSettings {
  /**
   * Surface the "print for a teammate" entry point. Ships OFF and is a
   * separate switch from `paper_answer_sheets` on purpose: delegation is the
   * app's first act-for-another-teacher path (plan §9), so it must be
   * killable without killing paper sheets for everyone.
   */
  enabled: boolean;
}

export const DEFAULT_PLC_DELEGATED_PRINTING_SETTINGS: PlcDelegatedPrintingSettings =
  {
    enabled: false,
  };

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizePlcDelegatedPrintingSettings(
  raw: unknown
): PlcDelegatedPrintingSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_PLC_DELEGATED_PRINTING_SETTINGS;
  }
  const enabled = (raw as { enabled?: unknown }).enabled;
  return { enabled: enabled === true };
}
