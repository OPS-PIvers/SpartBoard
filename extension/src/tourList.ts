// The Tours tab and badge's cached list (docs/plans/WEB_TOURS_HELP_PANEL.md H5, H6).
import type { ApiFailure } from './spartboardApi';

export interface ListedTour {
  id: string;
  title: string;
  host: string;
  steps: number;
  version: number;
}

/** The last list webToursListV1 returned, kept in local storage for the badge. */
export interface TourListCache {
  at: number;
  tours: ListedTour[];
  /** Admins also get the Record tab (H5). */
  admin: boolean;
}

/** What the side panel asks the worker for and gets back. */
export type TourListReply =
  { ok: true; list: TourListCache } | { ok: false; why: ApiFailure };

export const TOUR_LIST_KEY = 'wt:list';
export const TOUR_LIST_ALARM = 'wt:list-refresh';
export const TOUR_LIST_REFRESH_MINUTES = 6 * 60;
const MAX_TOURS = 500;
const MAX_TITLE = 500;

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** The server's list, keeping only entries the panel can show and start. */
export function parseTourList(raw: unknown, now: number): TourListCache {
  const tours = isObj(raw) && Array.isArray(raw.tours) ? raw.tours : [];
  return {
    at: now,
    admin: isObj(raw) && raw.admin === true,
    tours: tours
      .filter(
        (t): t is ListedTour =>
          isObj(t) &&
          typeof t.id === 'string' &&
          typeof t.title === 'string' &&
          typeof t.host === 'string' &&
          t.host !== '' &&
          Number.isInteger(t.steps) &&
          Number.isInteger(t.version)
      )
      .slice(0, MAX_TOURS)
      .map(({ id, title, host, steps, version }) => ({
        id,
        title: title.slice(0, MAX_TITLE),
        host: host.toLowerCase(),
        steps,
        version,
      })),
  };
}

/** A web page's host, lowercased; '' for anything Chrome shows that isn't a web page. */
export function pageHost(url: string | undefined): string {
  if (!url || !/^https?:\/\//.test(url)) return '';
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/** The badge for a page: how many tours start on its host, or nothing. */
export function badgeFor(
  tours: readonly ListedTour[],
  url: string | undefined
): string {
  const host = pageHost(url);
  if (!host) return '';
  const count = tours.filter((t) => t.host === host).length;
  return count === 0 ? '' : count > 99 ? '99+' : String(count);
}

const byTitle = (a: ListedTour, b: ListedTour) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/** The Tours tab's two lists: this site's tours first, then the other sites' tours the search matches. */
export function toursForPanel(
  tours: readonly ListedTour[],
  host: string,
  query: string
): { here: ListedTour[]; others: ListedTour[] } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (t: ListedTour) => {
    const hay = `${t.title} ${t.host}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const found = tours.filter(matches);
  return {
    here: found.filter((t) => host !== '' && t.host === host).sort(byTitle),
    others: found.filter((t) => host === '' || t.host !== host).sort(byTitle),
  };
}

/** The side panel's requests to the worker. */
export type TourPanelMessage =
  | { type: 'tours/list'; refresh: boolean }
  | { type: 'tours/start'; setId: string; tabId: number | null };

export type TourStartReply = { ok: true } | { ok: false; why: ApiFailure };

const SET_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function parseTourPanelMessage(msg: unknown): TourPanelMessage | null {
  if (!isObj(msg)) return null;
  if (msg.type === 'tours/list' && typeof msg.refresh === 'boolean')
    return { type: 'tours/list', refresh: msg.refresh };
  if (
    msg.type === 'tours/start' &&
    typeof msg.setId === 'string' &&
    SET_ID.test(msg.setId) &&
    (msg.tabId === null || Number.isInteger(msg.tabId))
  )
    return {
      type: 'tours/start',
      setId: msg.setId,
      tabId: msg.tabId as number | null,
    };
  return null;
}
