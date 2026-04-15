import { DailySchedule, ScheduleItem } from '@/types';

/** Returns today's date as YYYY-MM-DD in the user's local timezone. */
export const getTodayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Parses an "HH:MM" time string and returns minutes since midnight, or -1 if invalid. */
export const parseScheduleTime = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
};

/** Parses an "HH:MM" time string and returns seconds since midnight, or -1 if invalid. */
export const parseScheduleTimeSeconds = (t: string | undefined): number => {
  if (!t || !t.includes(':')) return -1;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 3600 + m * 60;
};

/**
 * Returns the duration (in seconds) for a schedule item.
 *
 * - For timer-mode items: prefers the explicit `durationSeconds` field when set.
 * - Legacy / fallback: infers duration from `endTime - startTime` when both are
 *   valid HH:MM strings. This lets older timer-mode items (that used the old
 *   start/end model) keep rendering a sensible countdown without a data
 *   migration.
 *
 * Returns 0 when no duration can be determined.
 */
export const getItemDurationSeconds = (item: ScheduleItem): number => {
  if (
    typeof item.durationSeconds === 'number' &&
    isFinite(item.durationSeconds) &&
    item.durationSeconds > 0
  ) {
    return item.durationSeconds;
  }
  // In dev, flag timer-mode items whose durationSeconds is present but unusable
  // (NaN, negative, zero, Infinity). Falling through to endTime inference still
  // lets the item render, but a silent 0-second countdown is a data bug worth
  // surfacing to whoever created/edited the item.
  if (
    item.mode === 'timer' &&
    item.durationSeconds !== undefined &&
    (typeof item.durationSeconds !== 'number' ||
      !isFinite(item.durationSeconds) ||
      item.durationSeconds <= 0) &&
    import.meta.env.DEV
  ) {
    console.warn(
      `[Schedule] Timer item "${item.task?.trim() ? item.task : (item.id ?? '(unnamed)')}" has invalid durationSeconds:`,
      item.durationSeconds
    );
  }
  const startSec = parseScheduleTimeSeconds(item.startTime ?? item.time);
  const endSec = parseScheduleTimeSeconds(item.endTime);
  if (startSec !== -1 && endSec !== -1 && endSec > startSec) {
    return endSec - startSec;
  }
  return 0;
};

/**
 * An item's computed position in the schedule's time chain.
 *
 * Clock-mode items anchor to their explicit startTime/endTime. Timer-mode
 * items chain off the previous item's `endSec` and add their own duration.
 * If a timer-mode item has no valid predecessor to anchor to (e.g. it is the
 * first item), it is marked `isIdle` — the widget face shows its duration
 * frozen and the countdown does not run.
 */
export interface EffectiveTime {
  /** Seconds since midnight when this item effectively begins. -1 if idle. */
  startSec: number;
  /** Seconds since midnight when this item effectively ends. -1 if idle. */
  endSec: number;
  /** True when the item has no anchor (timer-mode with no preceding event). */
  isIdle: boolean;
}

/**
 * Computes effective start/end seconds for each item in `items`, in order.
 *
 * - Clock-mode items use their explicit `startTime` (and `endTime`, falling
 *   back to the next clock-mode item's start — matching the existing
 *   activeIndex inference logic).
 * - Timer-mode items chain off the previous item's `endSec`. They add
 *   `getItemDurationSeconds(item)` to produce their `endSec`.
 * - Items without a computable anchor are `isIdle: true`.
 *
 * Returns an array parallel to `items`.
 */
export const computeEffectiveTimes = (
  items: ScheduleItem[]
): EffectiveTime[] => {
  const result: EffectiveTime[] = [];

  // Precompute clock-mode starts so we can infer endSec for clock items
  // that lack an explicit endTime (by looking at the next clock-mode start).
  const clockStartSecByIndex: number[] = items.map((item) => {
    if (item.mode === 'timer') return -1;
    return parseScheduleTimeSeconds(item.startTime ?? item.time);
  });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prev: EffectiveTime | undefined = i > 0 ? result[i - 1] : undefined;

    if (item.mode === 'timer') {
      const duration = getItemDurationSeconds(item);
      if (!prev || prev.isIdle || prev.endSec === -1 || duration <= 0) {
        result[i] = { startSec: -1, endSec: -1, isIdle: true };
      } else {
        const startSec = prev.endSec;
        result[i] = {
          startSec,
          endSec: startSec + duration,
          isIdle: false,
        };
      }
      continue;
    }

    // Clock mode (default).
    const startSec = clockStartSecByIndex[i];
    if (startSec === -1) {
      result[i] = { startSec: -1, endSec: -1, isIdle: true };
      continue;
    }
    let endSec = parseScheduleTimeSeconds(item.endTime);
    if (endSec === -1) {
      // Infer from the nearest later clock-mode start (matches the existing
      // inference in ScheduleWidget.activeIndex so behavior stays consistent).
      let nearest = -1;
      for (let j = 0; j < items.length; j++) {
        const s = clockStartSecByIndex[j];
        if (s > startSec && (nearest === -1 || s < nearest)) {
          nearest = s;
        }
      }
      endSec = nearest;
    }
    result[i] = {
      startSec,
      endSec,
      isIdle: false,
    };
  }

  return result;
};

/** Formats a total-seconds value into M:SS or H:MM:SS. */
export const formatCountdown = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/**
 * Formats an "HH:MM" (24-hour) stored time string for display.
 * Returns 12-hour "h:MM AM/PM" when format24 is false, otherwise "HH:MM".
 */
export const formatScheduleTime = (
  time: string | undefined,
  format24: boolean
): string => {
  if (!time || !time.includes(':')) return '';
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  if (format24) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const hours12 = h % 12 || 12;
  return `${hours12}:${m.toString().padStart(2, '0')} ${period}`;
};

/** Result of resolving the active schedule. */
export interface ResolvedSchedule {
  /** The actual schedule object (might be a migrated legacy one). */
  schedule: DailySchedule;
  /** Whether this is the legacy config.items schedule. */
  isLegacy: boolean;
}

/** Resolves the active schedule based on current rules. */
export const resolveActiveSchedule = (
  schedules: DailySchedule[],
  legacyItems: ScheduleItem[],
  today: number
): ResolvedSchedule | null => {
  // 1. Check legacy mode (no schedules defined yet)
  if (schedules.length === 0) {
    if (legacyItems.length === 0) return null;
    return {
      isLegacy: true,
      schedule: {
        id: 'default',
        name: 'Default Schedule',
        items: legacyItems,
        days: [],
      },
    };
  }

  // 2. Single schedule mode
  if (schedules.length === 1) {
    return { isLegacy: false, schedule: schedules[0] };
  }

  // 3. Multi-schedule mode (select by day)
  const match = schedules.find((s) => s.days.includes(today));
  return match ? { isLegacy: false, schedule: match } : null;
};

/** Result of resolving the active schedule. */
export interface ActiveScheduleResult {
  id: string;
  isLegacy: boolean;
}

/** Resolves the ID of the active schedule based on current rules. */
export const getActiveScheduleId = (
  schedules: DailySchedule[],
  legacyItems: ScheduleItem[],
  today: number
): ActiveScheduleResult | null => {
  // 1. Check legacy mode (no schedules defined yet)
  if (schedules.length === 0) {
    return legacyItems.length > 0 ? { id: 'default', isLegacy: true } : null;
  }

  // 2. Single schedule mode
  if (schedules.length === 1) {
    return { id: schedules[0].id, isLegacy: false };
  }

  // 3. Multi-schedule mode (select by day)

  const match = schedules.find((s) => s.days.includes(today));
  return match ? { id: match.id, isLegacy: false } : null;
};
