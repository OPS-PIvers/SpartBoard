// Pure view logic for the Focus widget: session phase, roster rows and what a typed site covers.
import {
  FOCUS_MAX_SITES,
  FOCUS_NOT_CONNECTED_MS,
  FOCUS_RETENTION_DAYS,
  type FocusSessionDoc,
  type FocusSite,
  type FocusStudentDoc,
  type FocusStudentSummary,
} from '@/utils/focus/contract';
import { parseFocusSite } from '@/utils/focus/allowlist';
import type {
  ClassRoster,
  EmbedConfig,
  UrlWidgetConfig,
  WidgetData,
} from '@/types';

export interface FocusSessionRow extends FocusSessionDoc {
  id: string;
}

export const isFocusSessionLive = (s: FocusSessionDoc, now: number): boolean =>
  s.endedAt === null && s.endsAt > now;

/** The class's running session, if any; one per class is a server rule, so the newest wins a stale overlap. */
export function liveFocusSession(
  sessions: readonly FocusSessionRow[],
  now: number
): FocusSessionRow | null {
  return (
    [...sessions]
      .filter((s) => isFocusSessionLive(s, now))
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  );
}

/** Ended sessions still inside the retention window, newest first (the TTL can lag a day). */
export function pastFocusSessions(
  sessions: readonly FocusSessionRow[],
  now: number
): FocusSessionRow[] {
  const cutoff = now - FOCUS_RETENTION_DAYS * 86_400_000;
  return sessions
    .filter((s) => !isFocusSessionLive(s, now) && s.startedAt >= cutoff)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** Rosters a session can target: ClassLink classes and the admin mock classes. */
export function focusClassRosters(
  rosters: readonly ClassRoster[]
): ClassRoster[] {
  return rosters.filter((r) => !!(r.classlinkClassId ?? r.testClassId));
}

export const rosterClassId = (r: ClassRoster): string =>
  r.classlinkClassId ?? r.testClassId ?? '';

export type FocusRowStatus =
  | { kind: 'on-task' }
  | { kind: 'away'; awayMs: number }
  | { kind: 'connecting' }
  | { kind: 'not-connected' }
  | { kind: 'released' }
  | { kind: 'other-session'; endsAt: number | null };

/** Total time away so far, including a running stretch. */
export function focusAwayMs(
  s: Pick<FocusStudentDoc, 'awayMs' | 'awaySince'>,
  now: number
): number {
  return (
    (s.awayMs ?? 0) +
    (typeof s.awaySince === 'number' ? Math.max(0, now - s.awaySince) : 0)
  );
}

/** F4: a student counts as Not connected after 3 minutes with no report (from their last one, or the session start). */
export function focusRowStatus(
  s: FocusStudentDoc,
  startedAt: number,
  now: number
): FocusRowStatus {
  if (s.status === 'released') return { kind: 'released' };
  if (s.status === 'other-session')
    return { kind: 'other-session', endsAt: s.otherSessionEndsAt };
  const heardAt = s.lastReportAt ?? null;
  const since = now - (heardAt ?? startedAt);
  if (since > FOCUS_NOT_CONNECTED_MS) return { kind: 'not-connected' };
  if (heardAt === null || s.status === 'waiting') return { kind: 'connecting' };
  if (s.status === 'away') return { kind: 'away', awayMs: focusAwayMs(s, now) };
  return { kind: 'on-task' };
}

export interface FocusCounts {
  onTask: number;
  away: number;
  notConnected: number;
  connecting: number;
  released: number;
  otherSession: number;
}

export function focusCounts(statuses: readonly FocusRowStatus[]): FocusCounts {
  const c: FocusCounts = {
    onTask: 0,
    away: 0,
    notConnected: 0,
    connecting: 0,
    released: 0,
    otherSession: 0,
  };
  for (const s of statuses) {
    if (s.kind === 'on-task') c.onTask++;
    else if (s.kind === 'away') c.away++;
    else if (s.kind === 'not-connected') c.notConnected++;
    else if (s.kind === 'connecting') c.connecting++;
    else if (s.kind === 'released') c.released++;
    else c.otherSession++;
  }
  return c;
}

/** Roster order: students who need the teacher first, then by name. */
const ROW_ORDER: Record<FocusRowStatus['kind'], number> = {
  away: 0,
  'not-connected': 1,
  connecting: 2,
  'on-task': 3,
  'other-session': 4,
  released: 5,
};

export function compareFocusRows(
  a: { status: FocusRowStatus; name: string },
  b: { status: FocusRowStatus; name: string }
): number {
  return (
    ROW_ORDER[a.status.kind] - ROW_ORDER[b.status.kind] ||
    a.name.localeCompare(b.name)
  );
}

export const isFocusSummary = (
  d: FocusStudentDoc | FocusStudentSummary
): d is FocusStudentSummary => d.status === 'ended';

/** 'm:ss' under an hour, else 'h:mm:ss'. */
export function formatFocusDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Whole minutes left, rounded up so "1 min" shows until the end. */
export const focusMinutesLeft = (endsAt: number, now: number): number =>
  Math.max(0, Math.ceil((endsAt - now) / 60_000));

export const focusSiteLabel = (s: FocusSite): string => `${s.host}${s.path}`;

const sameSite = (a: FocusSite, b: FocusSite) =>
  a.host === b.host && a.path === b.path;

const GOOGLE_FILE_HOST =
  /^(?:www\.)?(docs|drive|classroom|sites|jamboard)\.google\.com$/i;
const GOOGLE_FILE_PATH =
  /^\/(?:document|spreadsheets|presentation|drawings|forms|file)\//;

export type FocusSiteInput =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  /** A Drive `open?id=` style link, which names the file only in the query. */
  | { kind: 'query-id' }
  | { kind: 'ok'; site: FocusSite; covers: string };

/** Parses what the teacher typed and says, in words, what it will allow. */
export function explainFocusSite(input: string): FocusSiteInput {
  const text = input.trim();
  if (!text) return { kind: 'empty' };
  const site = parseFocusSite(text);
  if (!site) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(text) ? text : `https://${text}`
      );
      if (
        GOOGLE_FILE_HOST.test(url.hostname) &&
        /^\/(?:u\/\d+\/)?(?:open|uc|viewer)\/?$/.test(url.pathname)
      )
        return { kind: 'query-id' };
    } catch {
      // Falls through to invalid.
    }
    return { kind: 'invalid' };
  }
  const typedHost = text
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^\*\./, '')
    .split(/[/?#:]/)[0]
    .toLowerCase();
  let covers: string;
  if (site.path === '') {
    covers = typedHost.startsWith('www.')
      ? `all of ${site.host} and its subdomains, not only www.`
      : `all of ${site.host} and its subdomains.`;
  } else if (
    GOOGLE_FILE_HOST.test(site.host) &&
    GOOGLE_FILE_PATH.test(`${site.path}/`)
  ) {
    covers = 'this one file.';
  } else {
    covers = `pages under ${focusSiteLabel(site)}.`;
  }
  return { kind: 'ok', site, covers };
}

/** Adds a site unless it is already listed or the list is full. */
export function addFocusSite(
  sites: readonly FocusSite[],
  site: FocusSite
): FocusSite[] {
  if (sites.some((s) => sameSite(s, site)) || sites.length >= FOCUS_MAX_SITES)
    return [...sites];
  return [...sites, site];
}

/** Sites from the board's Links and Embed widgets that the list does not have yet. */
export function boardFocusSites(
  widgets: readonly WidgetData[],
  current: readonly FocusSite[]
): FocusSite[] {
  const out: FocusSite[] = [];
  const consider = (raw: unknown) => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    const site = parseFocusSite(raw);
    if (!site) return;
    if ([...current, ...out].some((s) => sameSite(s, site))) return;
    out.push(site);
  };
  for (const w of widgets) {
    if (w.type === 'url') {
      const urls = (w.config as UrlWidgetConfig).urls;
      if (Array.isArray(urls)) for (const u of urls) consider(u?.url);
    } else if (w.type === 'embed') {
      consider((w.config as EmbedConfig).url);
    }
  }
  return out;
}
