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

/** Converts a hex color + alpha into an rgba() CSS string. */
export const hexToRgba = (hex: string | undefined, alpha: number): string => {
  const clean = (hex ?? '#ffffff').replace('#', '');
  const a =
    typeof alpha === 'number' && !isNaN(alpha)
      ? Math.max(0, Math.min(1, alpha))
      : 1;
  if (clean.length !== 6) return `rgba(255, 255, 255, ${a})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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
