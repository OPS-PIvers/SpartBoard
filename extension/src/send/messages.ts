// Messages between the Send button, the side panel and the service worker, which alone may call SpartBoard (CORS).

import type { ApiFailure } from '../spartboardApi';
import type { ImportSendRequest } from '@/utils/import/contract';

export const SEND_CONTENT_FILE = 'send.js';
export const SEND_HOST_ID = 'spartboard-send';

/** From the Send content script in a page. */
export type SendPageMessage =
  | { type: 'send/state' }
  | { type: 'send/page'; request: ImportSendRequest }
  | { type: 'send/open' };

/** From the service worker to the content script. */
export type SendTabMessage =
  /** The toolbar or right-click asked to send; `blocked` shows the refusal instead of reading. */
  | { type: 'send/now'; blocked: boolean }
  /** The page's address changed in place; ask for the state again. */
  | { type: 'send/recheck' };

/** From the side panel's Send section. */
export type SendPanelMessage =
  | { type: 'send/panel'; action: 'state'; tabId: number | null }
  | {
      type: 'send/panel';
      action: 'set';
      /** The panel's tab, which gets the button at once if it should now show. */
      tabId?: number;
      showOnPages?: boolean;
      host?: string;
      hidden?: boolean;
    }
  | { type: 'send/panel'; action: 'send'; tabId: number };

export interface SendStateReply {
  /** Staff with the flag, on a page not on the block list. */
  enabled: boolean;
  blocked: boolean;
  /** The edge tab shows: enabled, not blocked, and not hidden by the teacher. */
  show: boolean;
  /** The Schoology quiz reader may run on this page. */
  schoology: boolean;
}

export type SendReply =
  | { ok: true; blocks: number; images: number }
  | { ok: false; why: ApiFailure | 'blocked'; message?: string };

export interface PanelStateReply {
  enabled: boolean;
  showOnPages: boolean;
  /** The active tab's site, or null on a page Send can't read (a chrome:// page). */
  host: string | null;
  hiddenHere: boolean;
  blocked: boolean;
}

export type PanelReply = PanelStateReply | { ok: boolean };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

export function parseSendPageMessage(raw: unknown): SendPageMessage | null {
  if (!isObject(raw)) return null;
  if (raw.type === 'send/state') return { type: 'send/state' };
  if (raw.type === 'send/open') return { type: 'send/open' };
  if (raw.type === 'send/page' && isObject(raw.request))
    // The server checks every field; this only routes it.
    return {
      type: 'send/page',
      request: raw.request as unknown as ImportSendRequest,
    };
  return null;
}

export function parseSendTabMessage(raw: unknown): SendTabMessage | null {
  if (!isObject(raw)) return null;
  if (raw.type === 'send/now')
    return { type: 'send/now', blocked: raw.blocked === true };
  if (raw.type === 'send/recheck') return { type: 'send/recheck' };
  return null;
}

const tabIdOf = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

export function parseSendPanelMessage(raw: unknown): SendPanelMessage | null {
  if (!isObject(raw) || raw.type !== 'send/panel') return null;
  if (raw.action === 'state')
    return { type: 'send/panel', action: 'state', tabId: tabIdOf(raw.tabId) };
  if (raw.action === 'send') {
    const tabId = tabIdOf(raw.tabId);
    return tabId === null
      ? null
      : { type: 'send/panel', action: 'send', tabId };
  }
  if (raw.action === 'set') {
    const tabId = tabIdOf(raw.tabId);
    return {
      type: 'send/panel',
      action: 'set',
      ...(tabId === null ? {} : { tabId }),
      ...(typeof raw.showOnPages === 'boolean'
        ? { showOnPages: raw.showOnPages }
        : {}),
      ...(typeof raw.host === 'string' && typeof raw.hidden === 'boolean'
        ? { host: raw.host, hidden: raw.hidden }
        : {}),
    };
  }
  return null;
}
