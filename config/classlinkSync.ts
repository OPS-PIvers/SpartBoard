/** `admin_settings/classlink_sync` switch for the nightly ClassLink roster sync; an absent doc is on. */

export const CLASSLINK_SYNC_SETTINGS_DOC = 'classlink_sync';

export interface ClassLinkSyncSettings {
  enabled: boolean;
}

/** Only a literal `false` turns the job off, matching `readSyncSettings` in classlinkRosterSync.ts. */
export function normalizeClassLinkSyncSettings(
  raw: unknown
): ClassLinkSyncSettings {
  if (!raw || typeof raw !== 'object') return { enabled: true };
  return { enabled: (raw as { enabled?: unknown }).enabled !== false };
}
