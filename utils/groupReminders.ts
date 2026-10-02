import type {
  ClassRoster,
  RosterGroup,
  RosterGroupAlert,
  RosterGroupReminder,
  RosterGroupReminderSound,
  RosterGroupSymbol,
} from '@/types';

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

/** A light wash of a group's color for card and badge backgrounds. */
export const groupTint = (symbol?: RosterGroupSymbol, percent = 14) =>
  `color-mix(in srgb, ${symbol?.color ?? '#94a3b8'} ${percent}%, white)`;

export const SNOOZE_OPTIONS = [1, 2, 3, 5, 10];
export const LEAD_OPTIONS = [0, 1, 2, 3, 5, 10, 15];
export const MAX_ALERTS = 6;
export const EMAIL_MESSAGE_MAX = 500;
export const REMINDER_SOUNDS: RosterGroupReminderSound[] = [
  'off',
  'chime',
  'bell',
  'marimba',
  'harp',
];
/** A board opened up to this long after the time still shows the reminder. */
export const LATE_WINDOW_MS = 10 * 60 * 1000;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ICON_RE = /^[a-z0-9-]{1,40}$/;

export function toLocalDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function defaultGroupSymbol(): RosterGroupSymbol {
  return { icon: 'star', color: GROUP_COLORS[1] };
}

export function defaultGroupReminder(today = new Date()): RosterGroupReminder {
  return {
    enabled: true,
    days: [],
    alerts: [{ time: '09:00', leadMinutes: 0 }],
    repeat: 'weekly',
    startDate: toLocalDateKey(today),
    sound: 'off',
    snoozeMinutes: 3,
    showName: false,
    showTime: false,
    showMessage: false,
    message: '',
    emailAlert: false,
    emailMessage: '',
  };
}

export function parseGroupSymbol(raw: unknown): RosterGroupSymbol | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.icon !== 'string' || !ICON_RE.test(r.icon)) return undefined;
  return {
    icon: r.icon,
    color:
      typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color)
        ? r.color
        : GROUP_COLORS[1],
  };
}

const pickNumber = (v: unknown, options: number[], fallback: number) =>
  typeof v === 'number' && options.includes(v) ? v : fallback;

function parseAlert(raw: unknown): RosterGroupAlert | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as Record<string, unknown>;
  if (typeof a.time !== 'string' || !TIME_RE.test(a.time)) return undefined;
  return {
    time: a.time,
    leadMinutes: pickNumber(a.leadMinutes, LEAD_OPTIONS, 0),
  };
}

export function parseGroupReminder(
  raw: unknown
): RosterGroupReminder | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const alerts = (Array.isArray(r.alerts) ? r.alerts : [])
    .map(parseAlert)
    .filter((a): a is RosterGroupAlert => !!a)
    .slice(0, MAX_ALERTS);
  if (alerts.length === 0) return undefined;
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
    alerts,
    repeat: r.repeat === 'biweekly' ? 'biweekly' : 'weekly',
    startDate:
      typeof r.startDate === 'string' && DATE_RE.test(r.startDate)
        ? r.startDate
        : toLocalDateKey(new Date()),
    sound: REMINDER_SOUNDS.find((s) => s === r.sound) ?? 'off',
    snoozeMinutes: pickNumber(r.snoozeMinutes, SNOOZE_OPTIONS, 3),
    showName: r.showName === true,
    showTime: r.showTime === true,
    showMessage: r.showMessage === true,
    message: typeof r.message === 'string' ? r.message.slice(0, 80) : '',
    emailAlert: r.emailAlert === true,
    emailMessage:
      typeof r.emailMessage === 'string'
        ? r.emailMessage.slice(0, EMAIL_MESSAGE_MAX)
        : '',
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

/** True when any group in the class has an enabled reminder on at least one day. */
export function hasScheduledReminders(roster: ClassRoster): boolean {
  return (roster.groups ?? []).some(
    (g) => !!g.reminder?.enabled && g.reminder.days.length > 0
  );
}

/** Epoch ms of an "HH:mm" time on the calendar day of `d`. */
export function timeOn(time: string, d: Date): number {
  const [h, m] = time.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

export interface DueReminder {
  /** Stable per occurrence: roster, group, date and time. */
  key: string;
  rosterId: string;
  group: RosterGroup;
  time: string;
  at: number;
}

/** Reminders whose show time (time minus lead) passed today, within the late window. */
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
      for (const alert of reminder.alerts) {
        const at = timeOn(alert.time, today);
        const showAt = at - alert.leadMinutes * 60_000;
        if (now < showAt || now - showAt > LATE_WINDOW_MS) continue;
        due.push({
          key: `${roster.id}:${group.id}:${dateKey}:${alert.time}`,
          rosterId: roster.id,
          group,
          time: alert.time,
          at,
        });
      }
    }
  }
  return due.sort((a, b) => a.at - b.at);
}

export function formatReminderTime(time: string, locale?: string): string {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 3, h, m).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Mon, Wed · 10:15 AM, 1:40 PM", with "every 2 weeks" for biweekly. */
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
  const times = [...reminder.alerts]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((a) => formatReminderTime(a.time, locale))
    .join(', ');
  const parts = [days, times].filter(Boolean);
  if (reminder.repeat === 'biweekly') parts.push(everyTwoWeeksLabel);
  return parts.join(' · ');
}
