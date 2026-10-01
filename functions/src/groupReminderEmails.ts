// Emails a teacher at each pull-out group alert time, from the schedule copy the
// client mirrors to users/{uid}/group_email_alerts. Off unless
// admin_settings/group_reminder_emails.enabled is true.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';

/** Late alerts still send within this window, covering scheduler jitter. */
export const SEND_WINDOW_MIN = 10;
const PAGE_SIZE = 500;
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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

/** Alerts whose show time (time minus lead) passed within the send window. */
export function dueEmailAlerts(doc: EmailAlertDoc, now: Date): DueEmailAlert[] {
  let local;
  try {
    local = localParts(now, doc.timeZone);
  } catch {
    return [];
  }
  if (!doc.days.includes(local.weekday)) return [];
  if (!DATE_RE.test(doc.startDate) || local.dateKey < doc.startDate) return [];
  if (
    doc.repeat === 'biweekly' &&
    ((mondayOf(local.dateKey) - mondayOf(doc.startDate)) / 7) % 2 !== 0
  )
    return [];
  return doc.alerts.flatMap((a) => {
    const match = TIME_RE.exec(a.time);
    if (!match) return [];
    const showAt =
      Number(match[1]) * 60 + Number(match[2]) - (a.leadMinutes || 0);
    const late = local.minutes - showAt;
    return late >= 0 && late < SEND_WINDOW_MIN
      ? [{ dateKey: local.dateKey, time: a.time }]
      : [];
  });
}

export function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function buildGroupAlertEmail(
  doc: EmailAlertDoc,
  time: string
): { subject: string; text: string; html: string } {
  const when = formatTime12(time);
  const name = doc.groupName.trim();
  const subject = name ? `${name} at ${when}` : `Group reminder at ${when}`;
  const text = doc.message.trim() || subject;
  const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p><p style="color:#64748b">${escapeHtml(subject)}</p>`;
  return { subject, text: `${text}\n\n${subject}`, html };
}

function parseDoc(raw: admin.firestore.DocumentData): EmailAlertDoc | null {
  if (!Array.isArray(raw.days) || !Array.isArray(raw.alerts)) return null;
  if (typeof raw.timeZone !== 'string' || typeof raw.startDate !== 'string')
    return null;
  return {
    groupName: typeof raw.groupName === 'string' ? raw.groupName : '',
    days: raw.days.filter((d: unknown): d is number => typeof d === 'number'),
    alerts: raw.alerts.filter(
      (a: unknown): a is EmailAlertDoc['alerts'][number] =>
        !!a && typeof (a as { time?: unknown }).time === 'string'
    ),
    repeat: raw.repeat === 'biweekly' ? 'biweekly' : 'weekly',
    startDate: raw.startDate,
    timeZone: raw.timeZone,
    message: typeof raw.message === 'string' ? raw.message : '',
  };
}

export async function runGroupReminderEmails(
  db: admin.firestore.Firestore,
  auth: Pick<admin.auth.Auth, 'getUser'>,
  now: Date
): Promise<{ scanned: number; queued: number }> {
  const counts = { scanned: 0, queued: 0 };
  const settings = await db.doc('admin_settings/group_reminder_emails').get();
  if (settings.data()?.enabled !== true) return counts;

  const emails = new Map<string, string | null>();
  const emailFor = async (uid: string) => {
    if (!emails.has(uid)) {
      const user = await auth.getUser(uid).catch(() => null);
      emails.set(uid, user?.disabled ? null : (user?.email ?? null));
    }
    return emails.get(uid) ?? null;
  };

  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collectionGroup('group_email_alerts').limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    for (const snap of page.docs) {
      counts.scanned += 1;
      const uid = snap.ref.parent.parent?.id;
      const doc = parseDoc(snap.data());
      if (!uid || !doc) continue;
      for (const due of dueEmailAlerts(doc, now)) {
        const to = await emailFor(uid);
        if (!to) continue;
        const mailId = `group-alert_${uid}_${snap.id}_${due.dateKey}_${due.time}`;
        try {
          // create() fails on a retry or overlapping run, so each alert sends once.
          await db
            .collection('mail')
            .doc(mailId)
            .create({ to: [to], message: buildGroupAlertEmail(doc, due.time) });
          counts.queued += 1;
        } catch (err) {
          const code = (err as { code?: unknown }).code;
          if (code !== 6 && code !== 'already-exists') {
            logger.error('groupReminderEmails: failed to queue mail', {
              mailId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }
    if (page.size < PAGE_SIZE) break;
    last = page.docs[page.docs.length - 1];
  }
  return counts;
}

export const groupReminderEmails = onSchedule(
  {
    schedule: 'every 5 minutes',
    memory: '256MiB',
    maxInstances: 1,
    timeoutSeconds: 240,
  },
  async () => {
    const counts = await runGroupReminderEmails(
      admin.firestore(),
      admin.auth(),
      new Date()
    );
    if (counts.queued > 0) logger.info('groupReminderEmails: run', counts);
  }
);
