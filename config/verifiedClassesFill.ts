/** `admin_settings/verified_classes_fill` switch for the nightly class list fill; an absent doc is off. */

export const VERIFIED_CLASSES_FILL_SETTINGS_DOC = 'verified_classes_fill';

export interface VerifiedClassesFillSettings {
  enabled: boolean;
}

export const DEFAULT_VERIFIED_CLASSES_FILL_SETTINGS: VerifiedClassesFillSettings =
  { enabled: false };

/** Only a literal `true` turns the job on, matching the check in `verifiedClassesFill`. */
export function normalizeVerifiedClassesFillSettings(
  raw: unknown
): VerifiedClassesFillSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_VERIFIED_CLASSES_FILL_SETTINGS;
  }
  return { enabled: (raw as { enabled?: unknown }).enabled === true };
}
