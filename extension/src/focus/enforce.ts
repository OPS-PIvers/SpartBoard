// Redirect and Lock decisions (docs/plans/CHROME_EXTENSION.md F2, F9, F10): pure, so the Chrome glue stays thin.
import { FOCUS_ALWAYS_ALLOWED_HOSTS } from '@/utils/focus/contract';
import { matchFocusUrl } from '@/utils/focus/allowlist';
import {
  isBlockedTopLevel,
  isEnforcing,
  type FocusLocalState,
} from './focusState';

export interface TabInfo {
  id: number;
  windowId: number;
  url: string;
  active: boolean;
  lastAccessed: number;
}

/** True while the session holds the student at Redirect or Lock; Monitor never blocks. */
export const isBlocking = (
  state: FocusLocalState | null | undefined,
  now: number
): state is FocusLocalState =>
  !!state && isEnforcing(state, now) && state.session.level !== 'monitor';

export const isLocking = (
  state: FocusLocalState | null | undefined,
  now: number
): state is FocusLocalState =>
  isBlocking(state, now) && state.session.level === 'lock';

/** A web address outside the allowlist, or a non-web page that could show one; `ownPages` is `chrome.runtime.getURL('')`. */
export const isBlockedUrl = (
  url: string,
  state: FocusLocalState,
  origins: readonly string[],
  ownPages: string
) => isBlockedTopLevel(url, state.session.sites, origins, ownPages);

/** The focus page, optionally with the notice that a site was blocked. */
export const focusPageUrl = (base: string, notice = false) =>
  notice ? `${base}?notice=blocked` : base;

/** A parked tab's page; the original address rides in its own URL so a restart or update keeps it (F10). */
export const parkedUrl = (base: string, original: string) =>
  `${base}?parked=${encodeURIComponent(original)}`;

/** The address a parked tab returns to, or null when `url` isn't a parked page or carries no web address. */
export function parkedOriginal(url: string, base: string): string | null {
  if (!url.startsWith(`${base}?`)) return null;
  const original = new URLSearchParams(url.slice(base.length + 1)).get(
    'parked'
  );
  if (!original) return null;
  try {
    const parsed = new URL(original);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Our own focus page, with or without a query; parked pages included. */
export const isFocusPage = (url: string, base: string) =>
  url === base || url.startsWith(`${base}?`);

export type ReturnPlan =
  | { kind: 'reload'; tabId: number; url: string }
  | { kind: 'switch'; closeTabId: number; toTabId: number; toWindowId: number }
  | { kind: 'focus-page'; tabId: number };

/**
 * Where a blocked navigation sends the student (F2 Redirect): back to the page the tab was on when it was allowed,
 * else to the most recent allowed tab (closing the blocked one), else the tab becomes the focus page.
 */
export function returnPlan(
  tabId: number,
  /** Where the tab was before the blocked navigation (an allowed page or our own page), if known. */
  currentUrl: string | undefined,
  tabs: readonly TabInfo[],
  state: FocusLocalState,
  origins: readonly string[],
  base: string
): ReturnPlan {
  const isWeb = (u: string) => /^https?:/i.test(u);
  const goodWeb = (u: string) =>
    isWeb(u) && matchFocusUrl(u, state.session.sites, origins) === 'allowed';
  if (currentUrl && (goodWeb(currentUrl) || isFocusPage(currentUrl, base)))
    return { kind: 'reload', tabId, url: currentUrl };
  const others = tabs
    .filter(
      (t) =>
        t.id !== tabId &&
        (goodWeb(t.url) ||
          (isFocusPage(t.url, base) && !parkedOriginal(t.url, base)))
    )
    .sort((a, b) => b.lastAccessed - a.lastAccessed);
  const home = tabs.find((t) => t.id === tabId);
  const to =
    others.find((t) => home && t.windowId === home.windowId) ?? others[0];
  return to
    ? {
        kind: 'switch',
        closeTabId: tabId,
        toTabId: to.id,
        toWindowId: to.windowId,
      }
    : { kind: 'focus-page', tabId };
}

/** Tabs to park now: open on a blocked site while Redirect or Lock holds the student. */
export const tabsToPark = (
  tabs: readonly TabInfo[],
  state: FocusLocalState,
  origins: readonly string[],
  ownPages: string
) => tabs.filter((t) => isBlockedUrl(t.url, state, origins, ownPages));

/** Parked tabs to restore: all of them once nothing blocks, else those a newly added site now allows. */
export function tabsToRestore(
  tabs: readonly TabInfo[],
  blocking: FocusLocalState | null,
  origins: readonly string[],
  base: string,
  ownPages: string
): { id: number; url: string }[] {
  const out: { id: number; url: string }[] = [];
  for (const t of tabs) {
    const original = parkedOriginal(t.url, base);
    if (!original) continue;
    if (!blocking || !isBlockedUrl(original, blocking, origins, ownPages))
      out.push({ id: t.id, url: original });
  }
  return out;
}

/** Hosts the Lock rules let through: the session's sites, sign-in and this listing's SpartBoard hosts (F9). */
export function lockAllowedHosts(
  state: FocusLocalState,
  origins: readonly string[]
): string[] {
  const hosts = new Set<string>(FOCUS_ALWAYS_ALLOWED_HOSTS);
  for (const site of state.session.sites) hosts.add(site.host);
  for (const origin of origins) {
    try {
      hosts.add(new URL(origin).hostname);
    } catch {
      // A malformed origin can't be allowed anyway.
    }
  }
  return [...hosts].sort();
}
