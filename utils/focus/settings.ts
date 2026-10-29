import {
  DEFAULT_FOCUS_SETTINGS,
  DEFAULT_FOCUS_WINDOW,
  type FocusSettings,
  type FocusWindow,
} from './contract';

const FOCUS_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for 'HH:MM', or NaN. */
export const focusMinutesOf = (hhmm: string): number => {
  const m = FOCUS_HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

function isFocusTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A window the server will honor, or null. */
export function validFocusWindow(raw: unknown): FocusWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const { start, end, days, timeZone } = raw as Record<string, unknown>;
  if (
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    !(focusMinutesOf(start) < focusMinutesOf(end)) ||
    !Array.isArray(days) ||
    days.length === 0 ||
    !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    typeof timeZone !== 'string' ||
    !isFocusTimeZone(timeZone)
  ) {
    return null;
  }
  return { start, end, days: [...new Set(days as number[])], timeZone };
}

/** Reads `admin_settings/focus_sessions`; a malformed window falls back to the default, and only an explicit true turns on the live site. */
export function parseFocusSettings(raw: unknown): FocusSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_FOCUS_SETTINGS;
  const { window, showLiveSite } = raw as Record<string, unknown>;
  return {
    window: validFocusWindow(window) ?? DEFAULT_FOCUS_WINDOW,
    showLiveSite: showLiveSite === true,
  };
}
