import {
  escapeHtml,
  printHtmlDocument,
  type OpenWindow,
} from './printHtmlDocument';
import type { RosterGroup, RosterGroupReminder, Student } from '@/types';
import { formatReminderTime, reminderFallsOn } from './groupReminders';

export interface GroupScheduleLabels {
  title: string;
  printed: string;
  everyTwoWeeks: string;
  weeksOf: string;
  noGroups: string;
}

export interface GroupScheduleJob {
  rosterName: string;
  groups: RosterGroup[];
  students: Student[];
  labels: GroupScheduleLabels;
  /** SVG markup for a group's symbol, already sized for print. */
  symbolSvg: (group: RosterGroup) => string;
  now?: Date;
  locale?: string;
}

export interface GroupScheduleRow {
  time: string;
  group: RosterGroup;
  students: string[];
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const fullName = (s: Student) => `${s.firstName} ${s.lastName}`.trim() || s.id;

/** Each weekday's alerts in time order, for groups whose reminder is on. */
export function groupScheduleByDay(
  groups: RosterGroup[],
  students: Student[]
): Map<number, GroupScheduleRow[]> {
  const byId = new Map(students.map((s) => [s.id, fullName(s)]));
  const days = new Map<number, GroupScheduleRow[]>(
    WEEKDAYS.map((d) => [d, []])
  );
  for (const group of groups) {
    const r = group.reminder;
    if (!r?.enabled) continue;
    const names = group.studentIds
      .map((id) => byId.get(id))
      .filter((n): n is string => !!n)
      .sort((a, b) => a.localeCompare(b));
    for (const day of r.days) {
      for (const alert of r.alerts) {
        days.get(day)?.push({ time: alert.time, group, students: names });
      }
    }
  }
  for (const rows of days.values()) {
    rows.sort((a, b) => a.time.localeCompare(b.time));
  }
  return days;
}

/** Mondays of the next `count` weeks a biweekly reminder runs, from this week on. */
export function upcomingOnWeeks(
  reminder: RosterGroupReminder,
  now: Date,
  count = 4
): Date[] {
  if (reminder.days.length === 0) return [];
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const firstDay = Math.min(...reminder.days);
  const weeks: Date[] = [];
  for (let w = 0; weeks.length < count && w < count * 2 + 52; w++) {
    const week = new Date(monday.getTime() + w * WEEK_MS);
    week.setHours(0, 0, 0, 0);
    const day = new Date(week);
    day.setDate(week.getDate() + firstDay - 1);
    if (reminderFallsOn(reminder, day)) weeks.push(week);
  }
  return weeks;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Lexend, 'Segoe UI', Roboto, sans-serif; color: #1e293b; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 14px; }
  h1 { font-size: 20px; margin: 0; }
  h1 small { font-size: 13px; font-weight: 600; color: #475569; margin-left: 8px; }
  .printed { font-size: 11px; color: #64748b; }
  section { break-inside: avoid; margin-bottom: 14px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 4px; color: #334155; }
  section table { width: 100%; border-collapse: collapse; font-size: 12px; }
  section td { border-top: 1px solid #cbd5e1; padding: 6px 6px; vertical-align: top; }
  section td.time { width: 72px; font-weight: 700; white-space: nowrap; }
  section td.sym { width: 30px; }
  td.sym svg { width: 20px; height: 20px; display: block; }
  section td.group { width: 30%; font-weight: 700; }
  .weeks { display: block; font-weight: 400; font-size: 10.5px; color: #64748b; margin-top: 2px; }
  .none { font-size: 12px; color: #64748b; border-top: 1px solid #cbd5e1; padding: 6px; margin: 0; }
`;

export function buildGroupScheduleHtml(job: GroupScheduleJob): string {
  const now = job.now ?? new Date();
  const { labels, locale } = job;
  const shortDate = (d: Date) =>
    d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const days = groupScheduleByDay(job.groups, job.students);

  const sections = WEEKDAYS.map((day) => {
    const dayName = new Date(2000, 0, 2 + day).toLocaleDateString(locale, {
      weekday: 'long',
    });
    const rows = days.get(day) ?? [];
    const body =
      rows.length === 0
        ? `<p class="none">${escapeHtml(labels.noGroups)}</p>`
        : `<table>${rows
            .map((row) => {
              const r = row.group.reminder;
              const weeks =
                r?.repeat === 'biweekly'
                  ? `<span class="weeks">${escapeHtml(labels.everyTwoWeeks)} · ${escapeHtml(labels.weeksOf)} ${escapeHtml(
                      upcomingOnWeeks(r, now).map(shortDate).join(', ')
                    )}</span>`
                  : '';
              return `<tr><td class="time">${escapeHtml(formatReminderTime(row.time, locale))}</td><td class="sym">${job.symbolSvg(row.group)}</td><td class="group">${escapeHtml(row.group.name.trim())}${weeks}</td><td>${escapeHtml(row.students.join(', '))}</td></tr>`;
            })
            .join('')}</table>`;
    return `<section><h2>${escapeHtml(dayName)}</h2>${body}</section>`;
  }).join('');

  return `<header><h1>${escapeHtml(job.rosterName)}<small>${escapeHtml(labels.title)}</small></h1><span class="printed">${escapeHtml(labels.printed)} ${escapeHtml(now.toLocaleDateString(locale))}</span></header>${sections}`;
}

export function printGroupSchedule(
  job: GroupScheduleJob,
  openWindow?: OpenWindow
): void {
  printHtmlDocument(
    {
      title: `${job.rosterName} ${job.labels.title}`,
      styles: STYLES,
      body: buildGroupScheduleHtml(job),
      marginMm: { vertical: 14, horizontal: 16 },
    },
    openWindow
  );
}
