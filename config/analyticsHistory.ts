/** Admin-curated `admin_settings/analytics_history` switch for the one-time pre-launch history estimate. */

export const ANALYTICS_HISTORY_SETTINGS_DOC = 'analytics_history';

export interface AnalyticsHistorySettings {
  /** Lets the nightly analytics job estimate days before its first measured run; ships off. */
  enabled: boolean;
}

export const DEFAULT_ANALYTICS_HISTORY_SETTINGS: AnalyticsHistorySettings = {
  enabled: false,
};

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeAnalyticsHistorySettings(
  raw: unknown
): AnalyticsHistorySettings {
  if (!raw || typeof raw !== 'object')
    return DEFAULT_ANALYTICS_HISTORY_SETTINGS;
  return { enabled: (raw as { enabled?: unknown }).enabled === true };
}
