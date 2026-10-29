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
