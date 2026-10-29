// Focus session time window on the server clock (docs/plans/CHROME_EXTENSION.md F6).
import {
  DEFAULT_FOCUS_WINDOW,
  FOCUS_EXTEND_MINUTES,
  FOCUS_MAX_MINUTES,
  focusMinutesOf as minutesOf,
  validFocusWindow,
  type FocusWindow,
} from './shared.gen';

/** Reads `admin_settings/focus_sessions.window`, falling back to the default for anything malformed. */
export function parseFocusWindow(raw: unknown): FocusWindow {
  return validFocusWindow(raw) ?? DEFAULT_FOCUS_WINDOW;
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
