import { FOCUS_SETTINGS_DOC } from '@/utils/focus/contract';
import { parseFocusSettings } from '@/utils/focus/settings';

/** `admin_settings/focus_sessions` (CHROME_EXTENSION.md F4, F6): session hours and the live-site switch, both read by the server. */
export const FOCUS_SESSIONS_SETTINGS_DOC = FOCUS_SETTINGS_DOC;

/** The live-site switch as a rollout switch row; off unless an admin saved an explicit true. */
export function normalizeFocusLiveSiteSettings(raw: unknown): {
  enabled: boolean;
} {
  return { enabled: parseFocusSettings(raw).showLiveSite };
}

export const FOCUS_HOURS_TITLE = 'Focus session hours';
/** Search fields for the hours row on Admin Settings > Previews. */
export const FOCUS_HOURS_SEARCH_FIELDS = [
  FOCUS_HOURS_TITLE,
  'focus window time days',
  FOCUS_SESSIONS_SETTINGS_DOC,
];
