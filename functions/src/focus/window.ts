// Focus session time window on the server clock (docs/plans/CHROME_EXTENSION.md F6).
import {
  DEFAULT_FOCUS_WINDOW,
  FOCUS_EXTEND_MINUTES,
  FOCUS_MAX_MINUTES,
  type FocusWindow,
} from './shared.gen';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minutesOf = (hhmm: string): number => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Reads `admin_settings/focus_sessions.window`, falling back to the default for anything malformed. */
export function parseFocusWindow(raw: unknown): FocusWindow {
  if (!raw || typeof raw !== 'object') return DEFAULT_FOCUS_WINDOW;
  const { start, end, days, timeZone } = raw as Record<string, unknown>;
  if (
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    !(minutesOf(start) < minutesOf(end)) ||
    !Array.isArray(days) ||
    days.length === 0 ||
    !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    typeof timeZone !== 'string' ||
    !isTimeZone(timeZone)
  ) {
    return DEFAULT_FOCUS_WINDOW;
  }
  return { start, end, days: [...new Set(days as number[])], timeZone };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday and seconds since local midnight in the window's time zone. */
function localClock(
  nowMs: number,
  timeZone: string
): { day: number; seconds: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    day: WEEKDAYS.indexOf(get('weekday') ?? ''),
    seconds:
      Number(get('hour')) * 3600 +
      Number(get('minute')) * 60 +
      Number(get('second')),
  };
}

/** When today's window closes, in epoch ms, or null when `nowMs` is outside the window. */
export function focusWindowEndsAt(
  nowMs: number,
  window: FocusWindow
): number | null {
  const { day, seconds } = localClock(nowMs, window.timeZone);
  if (!window.days.includes(day)) return null;
  const start = minutesOf(window.start) * 60;
  const end = minutesOf(window.end) * 60;
  if (seconds < start || seconds >= end) return null;
  // Exact while no clock change falls inside the window; US changes happen at 02:00.
  return nowMs - (nowMs % 1000) + (end - seconds) * 1000;
}

export type FocusTimeResult =
  | { ok: true; endsAt: number }
  | { ok: false; reason: 'outside-window' | 'bad-length' | 'ended' };

/** End time for a new session of `minutes`, cut at the window's close (F6). */
export function focusStartEndsAt(
  nowMs: number,
  minutes: number,
  window: FocusWindow
): FocusTimeResult {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > FOCUS_MAX_MINUTES)
    return { ok: false, reason: 'bad-length' };
  const windowEnd = focusWindowEndsAt(nowMs, window);
  if (windowEnd === null) return { ok: false, reason: 'outside-window' };
  return { ok: true, endsAt: Math.min(nowMs + minutes * 60_000, windowEnd) };
}

/** New end time after Extend (+10), cut at the window's close; refused once the session or the window has ended (F6). */
export function focusExtendEndsAt(
  nowMs: number,
  currentEndsAt: number,
  window: FocusWindow
): FocusTimeResult {
  const windowEnd = focusWindowEndsAt(nowMs, window);
  if (windowEnd === null || currentEndsAt >= windowEnd)
    return { ok: false, reason: 'outside-window' };
  if (currentEndsAt <= nowMs) return { ok: false, reason: 'ended' };
  return {
    ok: true,
    endsAt: Math.min(currentEndsAt + FOCUS_EXTEND_MINUTES * 60_000, windowEnd),
  };
}
