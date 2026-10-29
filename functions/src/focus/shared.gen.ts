// Generated from utils/focus/ by tests/focusSharedCopy.test.ts; rerun it with UPDATE_FOCUS_SHARED_COPY=1.
// Focus sessions shared contract (docs/plans/CHROME_EXTENSION.md F1-F11); copied into functions/src/focus/shared.gen.ts.

/** F2: Monitor records time away, Redirect sends the student back, Lock blocks and holds fullscreen. */
export type FocusLevel = 'monitor' | 'redirect' | 'lock';

export const FOCUS_LEVELS: readonly FocusLevel[] = [
  'monitor',
  'redirect',
  'lock',
];

export const DEFAULT_FOCUS_LEVEL: FocusLevel = 'redirect';

/** F9: one allowlist entry, a host (it and its subdomains) plus a path prefix matched at a segment boundary. */
export interface FocusSite {
  host: string;
  /** '' for the whole host, otherwise starts with '/' and has no trailing '/'. */
  path: string;
}

export const FOCUS_SESSIONS_COLLECTION = 'focus_sessions';
/** Subcollection of a session, keyed by the student's pseudonym uid. */
export const FOCUS_STUDENTS_SUBCOLLECTION = 'students';
/** F11 TTL field on both collection groups; `sessions/{id}/students` docs share the group and never use this name. */
export const FOCUS_TTL_FIELD = 'focusExpiresAt';
/** F5: one Web Push subscription per student, `focus_push_subscriptions/{studentUid}`, server-only. */
export const FOCUS_PUSH_COLLECTION = 'focus_push_subscriptions';
/** F4/F6 district settings doc, `admin_settings/{id}`. */
export const FOCUS_SETTINGS_DOC = 'focus_sessions';

export const FOCUS_MAX_MINUTES = 60;
export const FOCUS_EXTEND_MINUTES = 10;
export const FOCUS_MAX_SITES = 20;
/** F4: a student with no report for this long shows as Not connected. */
export const FOCUS_NOT_CONNECTED_MS = 3 * 60_000;
/** F5: the extension reports at most this often, plus on each status change. */
export const FOCUS_REPORT_MIN_INTERVAL_MS = 60_000;
/** F5: the extension's fallback check when no push arrives. */
export const FOCUS_CHECK_MINUTES = 5;
/** F11: ended sessions stay readable this long, then the TTL deletes them. */
export const FOCUS_RETENTION_DAYS = 30;

export const FOCUS_STUDENT_EMAIL_DOMAIN = 'students.orono.k12.mn.us';

/** F9: sign-in hosts every session allows; each listing adds its own SpartBoard origins (D5). */
export const FOCUS_ALWAYS_ALLOWED_HOSTS: readonly string[] = [
  'accounts.google.com',
  'launchpad.classlink.com',
];

/** F6: when sessions may run, on the server's clock. `days` uses 0 = Sunday. */
export interface FocusWindow {
  /** 'HH:MM', 24-hour. */
  start: string;
  end: string;
  days: number[];
  timeZone: string;
}

export const DEFAULT_FOCUS_WINDOW: FocusWindow = {
  start: '07:00',
  end: '16:00',
  days: [1, 2, 3, 4, 5],
  timeZone: 'America/Chicago',
};

/** `admin_settings/focus_sessions`; both switches ship off. */
export interface FocusSettings {
  window: FocusWindow;
  /** F4: adds each student's current domain to the live roster. Off on prod until counsel (G1). */
  showLiveSite: boolean;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  window: DEFAULT_FOCUS_WINDOW,
  showLiveSite: false,
};

/** `focus_sessions/{sessionId}`, server-written. Times are epoch ms on the server clock. */
export interface FocusSessionDoc {
  orgId: string;
  /** ClassLink class sourcedId (or the dev mock class id). */
  classId: string;
  className: string;
  /** Who started it. */
  teacherUid: string;
  teacherName: string;
  /** Teachers of the class who may read the session (F1); the server adds a co-teacher when they open it. */
  teacherUids: string[];
  level: FocusLevel;
  sites: FocusSite[];
  /** Pseudonym uids enrolled at start; F7 conflicts leave some in `students` as `other-session`. */
  studentUids: string[];
  startedAt: number;
  endsAt: number;
  /** Set when the session ends (End, the window closing, or time running out). */
  endedAt: number | null;
  endReason: 'teacher' | 'time' | 'window' | null;
  /** Subs whose share for this class was checked by the server; rules let them read until `subMonitorUntil` (F8). */
  subMonitorUids?: string[];
  subMonitorUntil?: number;
  [FOCUS_TTL_FIELD]?: unknown;
}

/** What the extension reports (F4); the roster derives Not connected from `lastReportAt`. */
export type FocusReportedStatus = 'on-task' | 'away';

/** Per-student state; `released` and `other-session` are set by the server. */
export type FocusStudentStatus =
  FocusReportedStatus | 'released' | 'other-session' | 'waiting';

/** `focus_sessions/{sessionId}/students/{studentUid}`, server-written. */
export interface FocusStudentDoc {
  status: FocusStudentStatus;
  /** Start of the current away stretch, or null. */
  awaySince: number | null;
  /** Finished away stretches; the roster adds the running one. */
  awayMs: number;
  blockedTries: number;
  lastReportAt: number | null;
  /** The extension's protocol at its last report (D6). */
  protocol: number | null;
  /** F4: current domain while the live-site switch is on, else null. Never logged. */
  liveHost: string | null;
  /** F7: when `other-session`, when the other one ends. */
  otherSessionEndsAt: number | null;
  [FOCUS_TTL_FIELD]?: unknown;
}

/** F11: what a student doc collapses to when the session ends. No sites. */
export interface FocusStudentSummary {
  status: 'ended';
  awayMs: number;
  blockedTries: number;
  connected: boolean;
  [FOCUS_TTL_FIELD]?: unknown;
}

/** A Web Push subscription as `PushSubscription.toJSON()` gives it (F5). */
export interface FocusPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Body of `POST focusStatusV1`; auth is the Chrome profile's Google token (F3). */
export interface FocusStatusRequest {
  protocol: number;
  push?: FocusPushSubscription | null;
}

/** The session as the student's extension sees it. */
export interface FocusActiveSession {
  sessionId: string;
  teacherName: string;
  level: FocusLevel;
  sites: FocusSite[];
  endsAt: number;
  /** True when this student was released; the extension stops enforcing and restores parked tabs. */
  released: boolean;
  /** F4: the focus page says the teacher can see the site. */
  showLiveSite: boolean;
}

export interface FocusStatusReply {
  session: FocusActiveSession | null;
  /** Lets the extension count down on the server's clock (F6). */
  serverNow: number;
}

/** Body of `POST focusReportV1`. */
export interface FocusReportRequest {
  sessionId: string;
  protocol: number;
  status: FocusReportedStatus;
  /** Running total of blocked top-level navigations in this session. */
  blockedTries: number;
  /** Current domain; the server keeps it only while `showLiveSite` is on. */
  host?: string | null;
}

export interface FocusReportReply {
  ok: true;
  /** False once the session ended or the student was released, so the extension checks status now. */
  active: boolean;
}

/** Body of the `focusStartV1` callable (F1, F6); `sites` are parsed with parseFocusSite on the client. */
export interface FocusStartRequest {
  /** ClassLink class sourcedId, or the mock class id on dev. */
  classId: string;
  className: string;
  level: FocusLevel;
  minutes: number;
  sites: FocusSite[];
}

export interface FocusStartReply {
  sessionId: string;
  endsAt: number;
  studentCount: number;
  /** F7: students another session already holds. */
  otherSessionCount: number;
}

export interface FocusExtendRequest {
  sessionId: string;
}

export interface FocusExtendReply {
  endsAt: number;
}

/** A substitute names the share that gives them the class (F8); teachers leave `shareId` out. */
export interface FocusReleaseRequest {
  sessionId: string;
  /** One student; left out releases the whole class. */
  studentUid?: string;
  shareId?: string;
}

export interface FocusReleaseReply {
  released: number;
}

export interface FocusAddSiteRequest {
  sessionId: string;
  site: FocusSite;
}

export interface FocusAddSiteReply {
  sites: FocusSite[];
}

export interface FocusEndRequest {
  sessionId: string;
  shareId?: string;
}

export interface FocusEndReply {
  endedAt: number;
}

/** Body of `focusOpenV1`: a co-teacher, or a substitute naming their share, finds the class's running session. */
export interface FocusOpenRequest {
  classId: string;
  shareId?: string;
}

export interface FocusOpenReply {
  sessionId: string | null;
}

/** Body of `focusPanelV1`, the extension side panel's Focus tab (F12), signed in with the teacher's Chrome Google token (H7). */
export type FocusPanelRequest =
  | { action: 'list' }
  | {
      action: 'start';
      classId: string;
      className: string;
      minutes: number;
      sites: FocusSite[];
    }
  | { action: 'extend' | 'release' | 'end'; sessionId: string };

/** A class the teacher has a ClassLink (or dev mock-class) roster for. */
export interface FocusPanelClass {
  classId: string;
  name: string;
}

/** A running session the teacher is on; the full roster stays in the widget. */
export interface FocusPanelSession {
  sessionId: string;
  classId: string;
  className: string;
  level: FocusLevel;
  sites: FocusSite[];
  endsAt: number;
  studentCount: number;
}

export interface FocusPanelListReply {
  classes: FocusPanelClass[];
  sessions: FocusPanelSession[];
}

// Focus allowlist parsing and matching (docs/plans/CHROME_EXTENSION.md F9); copied into functions/src/focus/shared.gen.ts.

const GOOGLE_FILE_HOSTS = new Set([
  'docs.google.com',
  'drive.google.com',
  'classroom.google.com',
  'sites.google.com',
  'jamboard.google.com',
]);

// Docs editors and Drive files: everything after the file id (/edit, /view, /preview, ...) is the same file.
const GOOGLE_FILE_PATH =
  /^(\/(?:document|spreadsheets|presentation|drawings|forms)\/d\/(?:e\/)?[^/]+|\/file\/d\/[^/]+)(?:\/|$)/;

// Google links that name the file only in the query; the entry would cover every file, so they are refused.
const GOOGLE_QUERY_ID_PATHS = new Set(['/open', '/uc', '/viewer']);

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function cleanHost(raw: string): string | null {
  let host = raw.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((l) => HOST_LABEL.test(l)))
    return null;
  // A bare number host is an IP address; sessions allow named sites only.
  if (labels.every((l) => /^\d+$/.test(l))) return null;
  return host;
}

/** Path in the form matching uses: Google's /u/N/ account segment dropped, Google file paths cut at the file id, no trailing '/'. */
export function canonicalFocusPath(host: string, rawPath: string): string {
  // Both sides come from URL.pathname, so percent-encoding already agrees; never decode (that would widen a prefix).
  let path = rawPath.replace(/\/{2,}/g, '/');
  if (GOOGLE_FILE_HOSTS.has(host)) {
    path = path.replace(/\/u\/\d+(?=\/|$)/g, '');
    const file = GOOGLE_FILE_PATH.exec(path);
    if (file) path = file[1];
  }
  path = path.replace(/\/+$/, '');
  return path === '' || path === '/' ? '' : path;
}

/** Parses what a teacher typed ("desmos.com", "https://docs.google.com/document/d/abc/edit") into a site, or null. */
export function parseFocusSite(input: string): FocusSite | null {
  const text = input.trim().replace(/^\*\./, '');
  if (!text || /\s/.test(text)) return null;
  const withScheme =
    /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(text)
      ? text
      : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = cleanHost(url.hostname);
  if (!host) return null;
  const path = canonicalFocusPath(host, url.pathname);
  if (GOOGLE_FILE_HOSTS.has(host) && GOOGLE_QUERY_ID_PATHS.has(path))
    return null;
  return { host, path };
}

/** True for a well-formed stored site: what parseFocusSite would return for it. */
export function isFocusSite(value: unknown): value is FocusSite {
  if (!value || typeof value !== 'object') return false;
  const { host, path } = value as Record<string, unknown>;
  if (typeof host !== 'string' || typeof path !== 'string') return false;
  const parsed = parseFocusSite(`https://${host}${path}`);
  return parsed?.host === host && parsed.path === path;
}

/** Drops invalid and duplicate sites and caps the list at FOCUS_MAX_SITES. */
export function normalizeFocusSites(values: readonly unknown[]): FocusSite[] {
  const out: FocusSite[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isFocusSite(value)) continue;
    const key = `${value.host}${value.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ host: value.host, path: value.path });
    if (out.length >= FOCUS_MAX_SITES) break;
  }
  return out;
}

function hostCovers(entryHost: string, host: string): boolean {
  return host === entryHost || host.endsWith(`.${entryHost}`);
}

function pathCovers(entryPath: string, path: string): boolean {
  return (
    entryPath === '' || path === entryPath || path.startsWith(`${entryPath}/`)
  );
}

export type FocusUrlVerdict = 'allowed' | 'blocked' | 'not-web';

/** Checks a top-level address against a session's sites; `alwaysAllowedOrigins` are the listing's SpartBoard origins (D5). */
export function matchFocusUrl(
  address: string,
  sites: readonly FocusSite[],
  alwaysAllowedOrigins: readonly string[] = []
): FocusUrlVerdict {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return 'not-web';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'not-web';
  if (alwaysAllowedOrigins.includes(url.origin)) return 'allowed';
  const rawHost = url.hostname.toLowerCase().replace(/\.$/, '');
  if (FOCUS_ALWAYS_ALLOWED_HOSTS.includes(rawHost)) return 'allowed';
  const host = rawHost.startsWith('www.') ? rawHost.slice(4) : rawHost;
  const path = canonicalFocusPath(host, url.pathname);
  return sites.some((s) => hostCovers(s.host, host) && pathCovers(s.path, path))
    ? 'allowed'
    : 'blocked';
}

const FOCUS_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for 'HH:MM', or NaN. */
export const focusMinutesOf = (hhmm: string): number => {
  const m = FOCUS_HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

function isFocusTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A window the server will honor, or null. */
export function validFocusWindow(raw: unknown): FocusWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const { start, end, days, timeZone } = raw as Record<string, unknown>;
  if (
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    !(focusMinutesOf(start) < focusMinutesOf(end)) ||
    !Array.isArray(days) ||
    days.length === 0 ||
    !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    typeof timeZone !== 'string' ||
    !isFocusTimeZone(timeZone)
  ) {
    return null;
  }
  return { start, end, days: [...new Set(days as number[])], timeZone };
}

/** Reads `admin_settings/focus_sessions`; a malformed window falls back to the default, and only an explicit true turns on the live site. */
export function parseFocusSettings(raw: unknown): FocusSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_FOCUS_SETTINGS;
  const { window, showLiveSite } = raw as Record<string, unknown>;
  return {
    window: validFocusWindow(window) ?? DEFAULT_FOCUS_WINDOW,
    showLiveSite: showLiveSite === true,
  };
}
