// Service-worker side of Schoology import (SCHOOLOGY_QUIZ_IMPORT Q4, Q8): inject the button on quiz pages, send to the inbox, open the review.

import type { ApiResult } from '../spartboardApi';
import { parseSchoologyMessage, type SendReply } from './messages';
import { isSchoologyHost, schoologyPage } from './page';
import type { InboxRequest } from './payload';

export const STATUS_KEY = 'schoologyImportStatus';
const STATUS_MINUTES = 30;
const FAILED_STATUS_MINUTES = 5;

export interface BoardTab {
  id: number;
  windowId: number;
  origin: string;
  /** Loaded and not discarded, so a script can run in it now. */
  ready: boolean;
}

interface StatusCache {
  enabled: boolean;
  at: number;
}

export interface SchoologyWorkerDeps {
  /** SpartBoard's page origins; the first is where a new review tab opens. */
  origins: readonly string[];
  isStaff: () => Promise<boolean>;
  status: () => Promise<ApiResult<{ enabled: boolean; hasAccount: boolean }>>;
  send: (
    request: InboxRequest
  ) => Promise<ApiResult<{ questions: number; pictures: number }>>;
  loadStatus: () => Promise<StatusCache | undefined>;
  saveStatus: (status: StatusCache) => Promise<void>;
  inject: (tabId: number) => Promise<void>;
  /** Open SpartBoard tabs showing a board, most recent first. */
  boardTabs: () => Promise<BoardTab[]>;
  focus: (tab: BoardTab) => Promise<void>;
  /** Fires the review event in a loaded board; true only when the page heard it. */
  askForReview: (tabId: number) => Promise<boolean>;
  /** Loads `url` in the tab, for a board that was discarded, loading or not listening yet. */
  navigate: (tabId: number, url: string) => Promise<void>;
  openTab: (url: string) => Promise<void>;
  now: () => number;
}

export function createSchoologyWorker(deps: SchoologyWorkerDeps) {
  /** The cached answer from `schoologyImportStatusV1`; no button, no reading, without the flag (Q14). */
  async function enabled(): Promise<boolean> {
    if (!(await deps.isStaff())) return false;
    const cached = await deps.loadStatus();
    const ttl =
      (cached?.enabled ? STATUS_MINUTES : FAILED_STATUS_MINUTES) * 60_000;
    if (cached && deps.now() - cached.at < ttl) return cached.enabled;
    const result = await deps.status();
    const on = result.ok && result.value.enabled && result.value.hasAccount;
    await deps.saveStatus({ enabled: on, at: deps.now() });
    return on;
  }

  async function navigated(tabId: number, frameId: number, url: string) {
    if (frameId !== 0 || !schoologyPage(url)) return;
    if (await enabled()) await deps.inject(tabId);
  }

  const reviewUrl = (origin: string) => `${origin}/?schoologyImport=1`;

  async function openReview(): Promise<void> {
    const [tab] = await deps.boardTabs();
    if (!tab) {
      await deps.openTab(reviewUrl(deps.origins[0]));
      return;
    }
    await deps.focus(tab);
    // An open board hears the event without reloading; a tab that can't, loads the review URL instead.
    const heard =
      tab.ready && (await deps.askForReview(tab.id).catch(() => false));
    if (!heard) await deps.navigate(tab.id, reviewUrl(tab.origin));
  }

  /** Handles a message from the content script; null when it isn't one, so another listener may answer. */
  function message(
    raw: unknown,
    senderUrl: string | undefined
  ): Promise<SendReply | { ok: true }> | null {
    const msg = parseSchoologyMessage(raw);
    if (!msg) return null;
    let host = '';
    try {
      host = new URL(senderUrl ?? '').hostname;
    } catch {
      return Promise.resolve({ ok: false, why: 'no-access' });
    }
    if (!isSchoologyHost(host))
      return Promise.resolve({ ok: false, why: 'no-access' });
    if (msg.type === 'schoology/open')
      return openReview().then(() => ({ ok: true as const }));
    return deps
      .send(msg.request)
      .then((result) => (result.ok ? { ok: true, ...result.value } : result));
  }

  return { enabled, navigated, message, openReview };
}
