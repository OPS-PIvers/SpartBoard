/** Kill switch `admin_settings/view_as` for super admin "View as" (docs/plans/ADMIN_VIEW_AS.md D17). */

export const VIEW_AS_SETTINGS_DOC = 'view_as';

export interface ViewAsSettings {
  /** Every view-as callable re-checks this, so turning it off stops new sessions and renewals. */
  enabled: boolean;
}

export const DEFAULT_VIEW_AS_SETTINGS: ViewAsSettings = { enabled: false };

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeViewAsSettings(raw: unknown): ViewAsSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_VIEW_AS_SETTINGS;
  return { enabled: (raw as { enabled?: unknown }).enabled === true };
}

/** `allowUnlock` on the same doc, read as a switch; the server re-checks it (D11). */
export function normalizeViewAsUnlockSettings(raw: unknown): {
  enabled: boolean;
} {
  if (!raw || typeof raw !== 'object') return { enabled: false };
  return { enabled: (raw as { allowUnlock?: unknown }).allowUnlock === true };
}
