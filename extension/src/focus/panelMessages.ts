// The side panel's Focus tab talks to the worker, which calls focusPanelV1 with the Chrome token (CHROME_EXTENSION.md F12, H7).
import {
  FOCUS_MAX_MINUTES,
  FOCUS_MAX_SITES,
  type FocusLevel,
  type FocusPanelClass,
  type FocusPanelListReply,
  type FocusPanelRequest,
  type FocusPanelSession,
  type FocusSite,
} from '@/utils/focus/contract';
import { isFocusSite, parseFocusSite } from '@/utils/focus/allowlist';
import type { ApiResult } from '../spartboardApi';

export interface FocusPanelMessage {
  type: 'focus/panel';
  body: FocusPanelRequest;
}

export type FocusPanelReply = ApiResult<unknown>;

const ID = /^[^/]{1,128}$/;
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);

/** Checks a panel request before the worker sends it on; anything else is dropped. */
export function parseFocusPanelMessage(msg: unknown): FocusPanelMessage | null {
  if (!isObj(msg) || msg.type !== 'focus/panel' || !isObj(msg.body))
    return null;
  const b = msg.body;
  const wrap = (body: FocusPanelRequest): FocusPanelMessage => ({
    type: 'focus/panel',
    body,
  });
  if (b.action === 'list') return wrap({ action: 'list' });
  if (
    (b.action === 'extend' || b.action === 'release' || b.action === 'end') &&
    isId(b.sessionId)
  )
    return wrap({ action: b.action, sessionId: b.sessionId });
  if (
    b.action === 'start' &&
    isId(b.classId) &&
    typeof b.className === 'string' &&
    b.className.length <= 100 &&
    Number.isInteger(b.minutes) &&
    (b.minutes as number) >= 1 &&
    (b.minutes as number) <= FOCUS_MAX_MINUTES &&
    Array.isArray(b.sites) &&
    b.sites.length >= 1 &&
    b.sites.length <= FOCUS_MAX_SITES &&
    b.sites.every(isFocusSite)
  )
    return wrap({
      action: 'start',
      classId: b.classId,
      className: b.className,
      minutes: b.minutes as number,
      sites: b.sites.map(({ host, path }) => ({ host, path })),
    });
  return null;
}

const LEVELS: readonly FocusLevel[] = ['monitor', 'redirect', 'lock'];

/** The list reply, with anything malformed dropped so the panel never renders it. */
export function parseFocusPanelList(raw: unknown): FocusPanelListReply | null {
  if (
    !isObj(raw) ||
    !Array.isArray(raw.classes) ||
    !Array.isArray(raw.sessions)
  )
    return null;
  const classes = raw.classes.filter(
    (c): c is FocusPanelClass =>
      isObj(c) && isId(c.classId) && typeof c.name === 'string'
  );
  const sessions = raw.sessions.filter(
    (s): s is FocusPanelSession =>
      isObj(s) &&
      isId(s.sessionId) &&
      isId(s.classId) &&
      typeof s.className === 'string' &&
      LEVELS.includes(s.level as FocusLevel) &&
      Array.isArray(s.sites) &&
      s.sites.every(isFocusSite) &&
      typeof s.endsAt === 'number' &&
      typeof s.studentCount === 'number'
  );
  return { canStart: raw.canStart === true, classes, sessions };
}

/** Shared hosts where the whole site would open far more than the teacher meant. */
const keepsPath = (site: FocusSite) =>
  site.host === 'docs.google.com' ||
  site.host === 'sites.google.com' ||
  (site.host === 'drive.google.com' && site.path.startsWith('/file/d/'));

/** The site the tab suggests: one Google file or Google Site stays just that, anything else is its whole site. */
export function siteForTab(url: string | undefined): FocusSite | null {
  const site = url ? parseFocusSite(url) : null;
  if (!site) return null;
  return keepsPath(site) && site.path ? site : { host: site.host, path: '' };
}

export const siteLabel = (site: FocusSite) => `${site.host}${site.path}`;

/** "12 min left", rounded up so a session never reads 0 while it still runs. */
export function minutesLeft(endsAt: number, now: number): string {
  const min = Math.max(0, Math.ceil((endsAt - now) / 60_000));
  return min <= 1 ? '1 min left' : `${min} min left`;
}
