import type {
  ClassRoster,
  RosterGroup,
  RosterGroupReminder,
  RosterGroupShape,
  RosterGroupSymbol,
} from '@/types';

export const GROUP_SHAPES: RosterGroupShape[] = [
  'star',
  'circle',
  'square',
  'triangle',
  'heart',
  'diamond',
  'hexagon',
  'moon',
];

/** No purple: red, amber, green, teal, sky, brand blue, pink, slate. */
export const GROUP_COLORS = [
  '#dc2626',
  '#f59e0b',
  '#16a34a',
  '#0d9488',
  '#0284c7',
  '#2d3f89',
  '#db2777',
  '#475569',
];

export const GROUP_EMOJIS = [
  '🐢',
  '🦊',
  '🐻',
  '🐸',
  '🦉',
  '🐝',
  '🐙',
  '🦋',
  '🌻',
  '🌈',
  '🚀',
  '⚽',
  '🎨',
  '🎵',
  '📚',
  '🍎',
];

export const SNOOZE_MS = 3 * 60 * 1000;
/** A board opened up to this long after the time still shows the reminder. */
export const LATE_WINDOW_MS = 10 * 60 * 1000;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOUNDS = ['off', 'chime', 'alarm'] as const;

export function toLocalDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function defaultGroupSymbol(): RosterGroupSymbol {
  return {
    kind: 'shape',
    shape: 'star',
    color: GROUP_COLORS[1],
    showName: false,
  };
}

export function defaultGroupReminder(today = new Date()): RosterGroupReminder {
  return {
    enabled: true,
    days: [],
    time: '09:00',
    repeat: 'weekly',
    startDate: toLocalDateKey(today),
    sound: 'off',
    showStudentNames: false,
  };
}

export function parseGroupSymbol(raw: unknown): RosterGroupSymbol | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'shape' && r.kind !== 'emoji') return undefined;
  const shape = GROUP_SHAPES.find((s) => s === r.shape);
  const emoji =
    typeof r.emoji === 'string' && r.emoji.length <= 16 ? r.emoji : undefined;
  if (r.kind === 'shape' && !shape) return undefined;
  if (r.kind === 'emoji' && !emoji) return undefined;
  return {
    kind: r.kind,
    ...(shape ? { shape } : {}),
    ...(emoji ? { emoji } : {}),
    color:
      typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color)
        ? r.color
        : GROUP_COLORS[1],
    showName: r.showName === true,
  };
}

export function parseGroupReminder(
  raw: unknown
): RosterGroupReminder | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.time !== 'string' || !TIME_RE.test(r.time)) return undefined;
  const days = Array.isArray(r.days)
    ? [
        ...new Set(
          r.days.filter(
            (d): d is number => Number.isInteger(d) && d >= 1 && d <= 7
          )
        ),
      ].sort((a, b) => a - b)
    : [];
  return {
    enabled: r.enabled !== false,
    days,
    time: r.time,
    repeat: r.repeat === 'biweekly' ? 'biweekly' : 'weekly',
    startDate:
      typeof r.startDate === 'string' && DATE_RE.test(r.startDate)
        ? r.startDate
        : toLocalDateKey(new Date()),
    sound: SOUNDS.find((s) => s === r.sound) ?? 'off',
    showStudentNames: r.showStudentNames === true,
  };
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
const isoWeekday = (d: Date): number => ((d.getDay() + 6) % 7) + 1;

/** Local midnight of the Monday starting the week that contains `d`. */
function weekStart(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - (isoWeekday(start) - 1));
  return start;
}

function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** True when the reminder falls on the calendar day of `d`. */
export function reminderFallsOn(
  reminder: RosterGroupReminder,
  d: Date
): boolean {
  if (!reminder.enabled || !reminder.days.includes(isoWeekday(d))) return false;
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const start = parseLocalDate(reminder.startDate);
  if (day < start) return false;
  if (reminder.repeat === 'weekly') return true;
  // Round, not floor: a DST shift makes the gap a few hours off whole weeks.
  const weeks = Math.round(
    (weekStart(day).getTime() - weekStart(start).getTime()) /
      (7 * 24 * 60 * 60 * 1000)
  );
  return weeks % 2 === 0;
}

/** Epoch ms of the reminder's time on the calendar day of `d`. */
export function reminderTimeOn(reminder: RosterGroupReminder, d: Date): number {
  const [h, m] = reminder.time.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

export interface DueReminder {
  /** Stable per occurrence: roster, group and date. */
  key: string;
  rosterId: string;
  group: RosterGroup;
  at: number;
  studentNames: string[];
}

/** Reminders whose time has passed today but by no more than the late window. */
export function dueReminders(
  rosters: ClassRoster[],
  now: number
): DueReminder[] {
  const today = new Date(now);
  const dateKey = toLocalDateKey(today);
  const due: DueReminder[] = [];
  for (const roster of rosters) {
    for (const group of roster.groups ?? []) {
      const reminder = group.reminder;
      if (!reminder || !reminderFallsOn(reminder, today)) continue;
      const at = reminderTimeOn(reminder, today);
      if (now < at || now - at > LATE_WINDOW_MS) continue;
      const members = new Set(group.studentIds);
      due.push({
        key: `${roster.id}:${group.id}:${dateKey}:${reminder.time}`,
        rosterId: roster.id,
        group,
        at,
        studentNames: roster.students
          .filter((s) => members.has(s.id))
          .map((s) => s.firstName.trim())
          .filter(Boolean),
      });
    }
  }
  return due.sort((a, b) => a.at - b.at);
}

/** Ms until the next reminder time today after `now`, or null when none is left. */
export function msUntilNextReminder(
  rosters: ClassRoster[],
  now: number
): number | null {
  const today = new Date(now);
  let next: number | null = null;
  for (const roster of rosters) {
    for (const group of roster.groups ?? []) {
      const reminder = group.reminder;
      if (!reminder || !reminderFallsOn(reminder, today)) continue;
      const at = reminderTimeOn(reminder, today);
      if (at > now && (next === null || at < next)) next = at;
    }
  }
  return next === null ? null : next - now;
}

export function formatReminderTime(time: string, locale?: string): string {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 3, h, m).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Mon, Wed · 10:15 AM", with "every 2 weeks" for biweekly. */
export function formatReminderSummary(
  reminder: RosterGroupReminder,
  everyTwoWeeksLabel: string,
  locale?: string
): string {
  // 2000-01-03 was a Monday, so day n of ISO week is Jan (2 + n).
  const days = reminder.days
    .map((d) =>
      new Date(2000, 0, 2 + d).toLocaleDateString(locale, { weekday: 'short' })
    )
    .join(', ');
  const parts = [days, formatReminderTime(reminder.time, locale)].filter(
    Boolean
  );
  if (reminder.repeat === 'biweekly') parts.push(everyTwoWeeksLabel);
  return parts.join(' · ');
}
