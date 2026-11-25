// Pure schedule math for group email alerts; tests/serverMirrorParity.test.ts checks it against utils/groupReminders.ts.

/** Late alerts still send within this window, covering scheduler jitter. */
export const SEND_WINDOW_MIN = 10;
/** Same caps as `MAX_ALERTS` and `EMAIL_MESSAGE_MAX` in utils/groupReminders.ts and the rules check. */
export const MAX_EMAIL_ALERTS = 6;
export const EMAIL_MESSAGE_MAX = 500;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface EmailAlertDoc {
  groupName: string;
  days: number[];
  alerts: { time: string; leadMinutes: number }[];
  repeat: 'weekly' | 'biweekly';
  startDate: string;
  timeZone: string;
  message: string;
}

export interface DueEmailAlert {
  dateKey: string;
  time: string;
}

/** Local calendar date, ISO weekday and minute of day of `now` in `timeZone`. */
export function localParts(
  now: Date,
  timeZone: string
): { dateKey: string; weekday: number; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays.indexOf(parts.weekday) + 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const dayNumber = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/** Days since the Monday that starts the week of `dateKey` (1970-01-05 was a Monday). */
const mondayOf = (dateKey: string) => {
  const n = dayNumber(dateKey);
  return n - ((((n - 4) % 7) + 7) % 7);
};

const dateKeyOf = (dayNum: number) =>
  new Date(dayNum * DAY_MS).toISOString().slice(0, 10);

/** Alerts whose show time (time minus lead) passed within the send window; a lead can reach back across midnight. */
export function dueEmailAlerts(doc: EmailAlertDoc, now: Date): DueEmailAlert[] {
  let local;
  try {
    local = localParts(now, doc.timeZone);
  } catch {
    return [];
  }
  if (!DATE_RE.test(doc.startDate)) return [];
  const today = dayNumber(local.dateKey);
  const out: DueEmailAlert[] = [];
  // Yesterday and tomorrow too, as the client does: the alert's day can differ from the day its show time falls on.
  for (const offset of [-1, 0, 1]) {
    const dateKey = dateKeyOf(today + offset);
    const weekday = ((((today + offset - 4) % 7) + 7) % 7) + 1;
    if (!doc.days.includes(weekday) || dateKey < doc.startDate) continue;
    if (
      doc.repeat === 'biweekly' &&
      ((mondayOf(dateKey) - mondayOf(doc.startDate)) / 7) % 2 !== 0
    )
      continue;
    const minutes = local.minutes - offset * 1440;
    for (const a of doc.alerts) {
      const match = TIME_RE.exec(a.time);
      if (!match) continue;
      const showAt =
        Number(match[1]) * 60 + Number(match[2]) - (a.leadMinutes || 0);
      const late = minutes - showAt;
      if (late >= 0 && late < SEND_WINDOW_MIN)
        out.push({ dateKey, time: a.time });
    }
  }
  return out;
}
