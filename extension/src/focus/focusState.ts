// The student's focus session as the extension keeps it (docs/plans/CHROME_EXTENSION.md F3, F5, F10).
import {
  FOCUS_LEVELS,
  FOCUS_MAX_SITES,
  FOCUS_STUDENT_EMAIL_DOMAIN,
  type FocusActiveSession,
  type FocusLevel,
  type FocusReportedStatus,
  type FocusStatusReply,
} from '@/utils/focus/contract';
import { matchFocusUrl, normalizeFocusSites } from '@/utils/focus/allowlist';
import { profileFromEmail } from '@/components/tours/web/extensionProtocol';

/** `chrome.storage.session` key; extension pages read it, content scripts can't. */
export const FOCUS_STATE_KEY = 'focus';
/** Set when a session this device held was cleared; absent after a restart until the first check. */
export const FOCUS_ENDED_KEY = 'focusEnded';

export interface FocusLocalState {
  session: FocusActiveSession;
  /** Server clock minus this device's clock at the last check (F6: the server decides). */
  offsetMs: number;
  /** The last status sent with `focusReportV1`, and when (device clock). */
  reported: FocusReportedStatus | null;
  reportedAt: number;
  reportedHost: string | null;
  /** Blocked navigations this session (Redirect and Lock; Monitor never blocks). Resets on restart; the server keeps the max. */
  blockedTries: number;
  /** `blockedTries` as last reported; absent in state saved before FS7. */
  reportedTries?: number;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Validates `focusStatusV1`'s reply; anything malformed reads as no reply. */
export function parseStatusReply(raw: unknown): FocusStatusReply | null {
  if (!isPlainObject(raw) || !finite(raw.serverNow)) return null;
  if (raw.session === null) return { session: null, serverNow: raw.serverNow };
  const s = raw.session;
  if (
    !isPlainObject(s) ||
    typeof s.sessionId !== 'string' ||
    s.sessionId === '' ||
    s.sessionId.length > 200 ||
    typeof s.teacherName !== 'string' ||
    !FOCUS_LEVELS.includes(s.level as FocusLevel) ||
    !Array.isArray(s.sites) ||
    !finite(s.endsAt) ||
    typeof s.released !== 'boolean' ||
    typeof s.showLiveSite !== 'boolean'
  ) {
    return null;
  }
  return {
    serverNow: raw.serverNow,
    session: {
      sessionId: s.sessionId,
      teacherName: s.teacherName.slice(0, 120),
      level: s.level as FocusLevel,
      sites: normalizeFocusSites(s.sites).slice(0, FOCUS_MAX_SITES),
      endsAt: s.endsAt,
      released: s.released,
      showLiveSite: s.showLiveSite,
    },
  };
}

/** `@students.orono.k12.mn.us` profiles take a session; a staff profile only when the server finds it in a mock class (F3). */
export function isStudentEmail(email: string | undefined): boolean {
  const trimmed = (email ?? '').trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  return at > 0 && trimmed.slice(at + 1) === FOCUS_STUDENT_EMAIL_DOMAIN;
}

/** A staff-domain profile, which the server treats as a student only as a mock-class test account. */
export const isStaffEmail = (email: string | undefined) =>
  profileFromEmail(email) === 'staff';

/** Milliseconds left on the server's clock, never below 0. */
export const msLeft = (state: FocusLocalState, deviceNow: number) =>
  Math.max(0, state.session.endsAt - (deviceNow + state.offsetMs));

/** Whole minutes left, rounded up, so the last minute shows 1 rather than 0. */
export const minutesLeft = (state: FocusLocalState, deviceNow: number) =>
  Math.ceil(msLeft(state, deviceNow) / 60_000);

/** True while the session holds this student: not released and time remains. */
export const isEnforcing = (
  state: FocusLocalState | null | undefined,
  deviceNow: number
): boolean =>
  !!state && !state.session.released && msLeft(state, deviceNow) > 0;

/** The toolbar badge (F10): minutes left while a session holds the student, else nothing. */
export const badgeText = (
  state: FocusLocalState | null | undefined,
  deviceNow: number
) =>
  state && isEnforcing(state, deviceNow)
    ? `${minutesLeft(state, deviceNow)}m`
    : '';

/** On task unless the top-level page is a web page outside the allowlist, or Lock's window left fullscreen (F2); extension and browser pages count as on task. */
export function statusFor(
  url: string | undefined,
  session: FocusActiveSession,
  origins: readonly string[],
  fullscreen = true
): FocusReportedStatus {
  if (session.level === 'lock' && !session.released && !fullscreen)
    return 'away';
  return url && matchFocusUrl(url, session.sites, origins) === 'blocked'
    ? 'away'
    : 'on-task';
}

/** The page's domain for F4's live-site view, only while that switch is on. */
export function liveHostFor(
  url: string | undefined,
  session: FocusActiveSession
): string | null {
  if (!session.showLiveSite || !url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

/** The address a site button opens. */
export const siteUrl = (site: { host: string; path: string }) =>
  `https://${site.host}${site.path}`;
