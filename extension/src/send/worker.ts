// Service-worker side of Send to SpartBoard (IMPORT D14-D16): the edge tab, the right-click item, the side panel switches and the block list.

import type { ApiResult } from '../spartboardApi';
import type {
  ImportSendReply,
  ImportSendRequest,
  ImportStatusReply,
} from '@/utils/import/contract';
import { isUrlBlocked } from '@/utils/import/sendBlockList';
import { schoologyPage } from '../schoology/page';
import {
  parseSendPageMessage,
  parseSendPanelMessage,
  type PanelReply,
  type SendReply,
  type SendStateReply,
  type SendTabMessage,
} from './messages';
import { buttonShown, siteOf, withHidden, type SendSettings } from './settings';

export const SEND_STATUS_KEY = 'importSendStatus';
const STATUS_MINUTES = 30;
const FAILED_STATUS_MINUTES = 5;

export interface SendStatusCache {
  enabled: boolean;
  blockPatterns: string[];
  at: number;
  /** SpartBoard couldn't be asked, so it asks again sooner. */
  failed?: boolean;
}

export interface SendBoardTab {
  id: number;
  windowId: number;
  origin: string;
}

export interface SendWorkerDeps {
  /** SpartBoard's page origins; the first is where a new inbox tab opens. */
  origins: readonly string[];
  isStaff: () => Promise<boolean>;
  status: () => Promise<ApiResult<ImportStatusReply>>;
  send: (request: ImportSendRequest) => Promise<ApiResult<ImportSendReply>>;
  loadStatus: () => Promise<SendStatusCache | undefined>;
  saveStatus: (status: SendStatusCache) => Promise<void>;
  loadSettings: () => Promise<SendSettings>;
  saveSettings: (settings: SendSettings) => Promise<void>;
  /** Injects the Send script into the tab's top frame; false when Chrome refuses (a chrome:// page). */
  inject: (tabId: number) => Promise<boolean>;
  tell: (tabId: number, message: SendTabMessage) => Promise<void>;
  tabUrl: (tabId: number) => Promise<string | undefined>;
  /** Adds or removes the right-click "Send to SpartBoard" item. */
  syncMenu: (on: boolean) => Promise<void>;
  /** Whether the Schoology quiz import is on for this teacher (its own flag). */
  schoologyEnabled: () => Promise<boolean>;
  boardTabs: () => Promise<SendBoardTab[]>;
  focus: (tab: SendBoardTab) => Promise<void>;
  navigate: (tabId: number, url: string) => Promise<void>;
  openTab: (url: string) => Promise<void>;
  now: () => number;
}

/** Where a Send lands; the Import inbox opens on it. */
export const INBOX_PARAM = 'importInbox';

export function createSendWorker(deps: SendWorkerDeps) {
  let menuOn: boolean | null = null;

  let asking: Promise<SendStatusCache> | null = null;

  async function fetchStatus(
    cached: SendStatusCache | undefined
  ): Promise<SendStatusCache> {
    const result = await deps.status();
    // A failed check keeps the last answer, so the block list still holds while SpartBoard is unreachable.
    const fresh: SendStatusCache = result.ok
      ? {
          enabled: result.value.enabled && result.value.hasAccount,
          blockPatterns:
            result.value.enabled && Array.isArray(result.value.blockPatterns)
              ? result.value.blockPatterns.filter((p) => typeof p === 'string')
              : [],
          at: deps.now(),
        }
      : {
          enabled: cached?.enabled ?? false,
          blockPatterns: cached?.blockPatterns ?? [],
          at: deps.now(),
          failed: true,
        };
    await deps.saveStatus(fresh);
    return fresh;
  }

  /** `importStatusV1`, cached and shared by every tab asking at once; a profile that isn't staff never asks. */
  async function status(): Promise<SendStatusCache> {
    if (!(await deps.isStaff()))
      return { enabled: false, blockPatterns: [], at: deps.now() };
    const cached = await deps.loadStatus();
    // Staff without the flag browse every page, so a firm answer is kept as long as a yes.
    const ttl =
      (cached?.failed ? FAILED_STATUS_MINUTES : STATUS_MINUTES) * 60_000;
    if (cached && deps.now() - cached.at < ttl) return cached;
    asking ??= fetchStatus(cached).finally(() => {
      asking = null;
    });
    return asking;
  }

  async function syncMenu(on: boolean) {
    if (menuOn === on) return;
    menuOn = on;
    await deps.syncMenu(on).catch(() => undefined);
  }

  const isSpartBoard = (url: string) =>
    deps.origins.some((o) => url === o || url.startsWith(`${o}/`));

  async function stateFor(url: string | undefined): Promise<SendStateReply> {
    const s = await status();
    void syncMenu(s.enabled);
    if (!s.enabled || !url || isSpartBoard(url))
      return { enabled: false, blocked: false, show: false, schoology: false };
    const blocked = isUrlBlocked(url, s.blockPatterns);
    const show = !blocked && buttonShown(await deps.loadSettings(), url);
    // The Schoology reader posts to its own inbox, which needs its own flag.
    const schoology =
      !blocked && !!schoologyPage(url) && (await deps.schoologyEnabled());
    return { enabled: true, blocked, show, schoology };
  }

  /** A new page in a top frame: inject the edge tab when it should show there. */
  async function navigated(tabId: number, frameId: number, url: string) {
    if (frameId !== 0 || !siteOf(url)) return;
    const state = await stateFor(url);
    if (state.show) await deps.inject(tabId);
  }

  /** The address changed without a new document: a tab showing the button checks again, and one that now should show gets it. */
  async function changedInPlace(tabId: number, frameId: number, url: string) {
    if (frameId !== 0) return;
    await deps.tell(tabId, { type: 'send/recheck' }).catch(() => undefined);
    await navigated(tabId, frameId, url);
  }

  /** The toolbar's "Send this page" or the right-click item: works even where the teacher hid the button. */
  async function sendFromBrowser(tabId: number): Promise<boolean> {
    const url = await deps.tabUrl(tabId);
    const state = await stateFor(url);
    if (!state.enabled) return false;
    if (!(await deps.inject(tabId))) return false;
    await deps
      .tell(tabId, { type: 'send/now', blocked: state.blocked })
      .catch(() => undefined);
    return true;
  }

  async function openInbox(): Promise<void> {
    const [tab] = await deps.boardTabs();
    if (!tab) {
      await deps.openTab(`${deps.origins[0]}/?${INBOX_PARAM}=1`);
      return;
    }
    await deps.focus(tab);
    await deps.navigate(tab.id, `${tab.origin}/?${INBOX_PARAM}=1`);
  }

  async function sendPage(
    request: ImportSendRequest,
    senderUrl: string | undefined
  ): Promise<SendReply> {
    const state = await stateFor(senderUrl);
    if (!state.enabled) return { ok: false, why: 'no-access' };
    const s = await status();
    // The page's own address and the one it claims must both be allowed.
    if (state.blocked || isUrlBlocked(request.url, s.blockPatterns))
      return { ok: false, why: 'blocked' };
    const result = await deps.send(request);
    return result.ok
      ? { ok: true, blocks: result.value.blocks, images: result.value.images }
      : result;
  }

  /** A message from the Send content script; null when it isn't one, so another listener may answer. */
  function message(
    raw: unknown,
    senderUrl: string | undefined
  ): Promise<SendStateReply | SendReply | { ok: true }> | null {
    const msg = parseSendPageMessage(raw);
    if (!msg) return null;
    if (msg.type === 'send/state') return stateFor(senderUrl);
    if (msg.type === 'send/open')
      return openInbox().then(() => ({ ok: true as const }));
    return sendPage(msg.request, senderUrl);
  }

  /** A message from the side panel's Send section. */
  function panel(raw: unknown): Promise<PanelReply> | null {
    const msg = parseSendPanelMessage(raw);
    if (!msg) return null;
    const run = async (): Promise<PanelReply> => {
      if (msg.action === 'send')
        return { ok: await sendFromBrowser(msg.tabId) };
      const settings = await deps.loadSettings();
      if (msg.action === 'set') {
        let next = settings;
        if (msg.showOnPages !== undefined)
          next = { ...next, showOnPages: msg.showOnPages };
        const host = msg.host ? siteOf(`https://${msg.host}/`) : null;
        if (host && msg.hidden !== undefined)
          next = withHidden(next, host, msg.hidden);
        await deps.saveSettings(next);
        // Open pages hear the change themselves; the panel's tab gets the button if it had none.
        const url =
          msg.tabId === undefined ? undefined : await deps.tabUrl(msg.tabId);
        if (msg.tabId !== undefined && url) await navigated(msg.tabId, 0, url);
        return { ok: true };
      }
      const url = msg.tabId === null ? undefined : await deps.tabUrl(msg.tabId);
      const state = await stateFor(url);
      const s = await status();
      const host = url && !isSpartBoard(url) ? siteOf(url) : null;
      return {
        enabled: s.enabled,
        showOnPages: settings.showOnPages,
        host,
        hiddenHere: !!host && settings.hiddenHosts.includes(host),
        blocked: state.blocked,
      };
    };
    return run();
  }

  return {
    status,
    stateFor,
    navigated,
    changedInPlace,
    sendFromBrowser,
    message,
    panel,
    openInbox,
  };
}
