// Chrome's side of Redirect and Lock (CHROME_EXTENSION.md F2, F10): tabs, session rules, fullscreen and the page notices.
import {
  focusPageUrl,
  isBlockedUrl,
  isBlocking,
  isFocusPage,
  isLocking,
  lockAllowedHosts,
  parkedUrl,
  returnPlan,
  tabsToPark,
  tabsToRestore,
  type TabInfo,
} from './enforce';
import type { FocusLocalState } from './focusState';
import {
  COVER_TEXT,
  COVER_TITLE,
  FOCUS_FULLSCREEN_MESSAGE,
  NOTICE_TEXT,
  showPageNotice,
  type PageNoticeKind,
} from './pageNotice';

/** Session rule ids this module owns; nothing else in the extension uses session rules. */
export const FOCUS_ALLOW_RULE_ID = 7001;
export const FOCUS_BLOCK_RULE_ID = 7002;
/** Windows Lock made fullscreen, with the state each had before, so the end puts them back. */
const LOCK_KEY = 'focusLock';
/** A second event for the same blocked address within this long is the same try (sent back again, counted once). */
const SAME_TRY_MS = 3_000;
/** Per tab, the last allowed address it showed while blocking; survives a worker restart, cleared at the end. */
const TAB_KEY_PREFIX = 'focusTab:';
/** A tab the worker is restoring is left alone for this long, so its way back isn't read as a try. */
const RESTORING_MS = 10_000;

interface LockRecord {
  sessionId: string;
  windows: Record<string, string>;
}

/** Tabs the Lock cover was put on; kept in session storage so a restarted worker can still take it off. */
const COVERED_KEY = 'focusCovered';

/** Fullscreen, or ChromeOS locked mode (a locked quiz), which is at least as strict. */
const isFull = (state: string | undefined) =>
  state === chrome.windows.WindowState.FULLSCREEN ||
  state === chrome.windows.WindowState.LOCKED_FULLSCREEN;

/** The state a window goes back to; one that was already fullscreen comes back maximized. */
const restoredState = (prev: string): chrome.windows.WindowState => {
  const { WindowState } = chrome.windows;
  if (prev === 'minimized') return WindowState.MINIMIZED;
  if (prev === 'normal') return WindowState.NORMAL;
  return WindowState.MAXIMIZED;
};

/** Addresses of our own pages by tab; without the "tabs" permission `tabs.query` hides chrome-extension:// URLs. */
export async function ownPageUrls(): Promise<Map<number, string>> {
  const contexts = await chrome.runtime
    .getContexts({ contextTypes: [chrome.runtime.ContextType.TAB] })
    .catch(() => []);
  return new Map(
    contexts
      .filter((c) => c.tabId >= 0 && c.documentUrl)
      .map((c) => [c.tabId, c.documentUrl ?? ''])
  );
}

/** The top frame's address; `tabs.query` hides data:, file: and browser pages, webNavigation doesn't. */
export async function topFrameUrl(tabId: number): Promise<string> {
  try {
    return (
      (await chrome.webNavigation.getFrame({ tabId, frameId: 0 }))?.url ?? ''
    );
  } catch {
    return '';
  }
}

const allTabs = async (): Promise<TabInfo[]> => {
  const [tabs, own] = await Promise.all([chrome.tabs.query({}), ownPageUrls()]);
  const out = await Promise.all(
    tabs.map(async (t): Promise<TabInfo | null> => {
      if (t.id === undefined || t.id === chrome.tabs.TAB_ID_NONE) return null;
      return {
        id: t.id,
        windowId: t.windowId,
        url:
          t.pendingUrl || t.url || own.get(t.id) || (await topFrameUrl(t.id)),
        active: t.active,
        lastAccessed: t.lastAccessed ?? 0,
      };
    })
  );
  return out.filter((t): t is TabInfo => t !== null);
};

function lockRules(
  state: FocusLocalState,
  origins: readonly string[]
): chrome.declarativeNetRequest.Rule[] {
  const { ResourceType, RuleActionType } = chrome.declarativeNetRequest;
  return [
    {
      id: FOCUS_ALLOW_RULE_ID,
      priority: 2,
      action: { type: RuleActionType.ALLOW },
      condition: {
        requestDomains: lockAllowedHosts(state, origins),
        resourceTypes: [ResourceType.MAIN_FRAME],
      },
    },
    {
      id: FOCUS_BLOCK_RULE_ID,
      priority: 1,
      action: { type: RuleActionType.BLOCK },
      condition: { resourceTypes: [ResourceType.MAIN_FRAME] },
    },
  ];
}

const sameRules = (
  a: chrome.declarativeNetRequest.Rule[],
  b: chrome.declarativeNetRequest.Rule[]
) => {
  const key = (rules: chrome.declarativeNetRequest.Rule[]) =>
    JSON.stringify(
      [...rules]
        .sort((x, y) => x.id - y.id)
        .map((r) => [r.id, r.priority, r.action.type, r.condition])
    );
  return key(a) === key(b);
};

async function setLockRules(rules: chrome.declarativeNetRequest.Rule[]) {
  const ours = (await chrome.declarativeNetRequest.getSessionRules()).filter(
    (r) => r.id === FOCUS_ALLOW_RULE_ID || r.id === FOCUS_BLOCK_RULE_ID
  );
  if (sameRules(ours, rules)) return;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [FOCUS_ALLOW_RULE_ID, FOCUS_BLOCK_RULE_ID],
    addRules: rules,
  });
}

async function inject(tabId: number, kind: PageNoticeKind) {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: showPageNotice,
      args: [
        kind,
        NOTICE_TEXT,
        COVER_TITLE,
        COVER_TEXT,
        FOCUS_FULLSCREEN_MESSAGE,
      ],
    })
    // Browser pages, the Web Store and other extensions can't be scripted; nothing to cover there.
    .catch(() => undefined);
}

const lastNormalWindow = () =>
  chrome.windows
    .getLastFocused({ windowTypes: [chrome.windows.WindowType.NORMAL] })
    .catch(() => undefined);

export function createChromeEnforcer(deps: {
  origins: readonly string[];
  load(): Promise<FocusLocalState | undefined>;
  now(): number;
}) {
  const base = chrome.runtime.getURL('focus/index.html');
  const ownPages = chrome.runtime.getURL('');
  // Tabs sent back to a page that should show the notice once it loads; lost with the worker, which only skips a notice.
  const noticeOnLoad = new Set<number>();
  const loadCovered = async () => {
    const value = (await chrome.storage.session.get(COVERED_KEY))[COVERED_KEY];
    return Array.isArray(value)
      ? value.filter((v): v is number => typeof v === 'number')
      : [];
  };
  const recent = new Map<number, { url: string; at: number }>();
  const restoring = new Map<number, number>();

  const rememberTab = (tabId: number, url: string) =>
    chrome.storage.session.set({ [`${TAB_KEY_PREFIX}${tabId}`]: url });
  const rememberedTab = async (tabId: number) => {
    const key = `${TAB_KEY_PREFIX}${tabId}`;
    const value = (await chrome.storage.session.get(key))[key];
    return typeof value === 'string' ? value : undefined;
  };
  const forgetTabs = async () => {
    const all = await chrome.storage.session.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(TAB_KEY_PREFIX));
    if (keys.length) await chrome.storage.session.remove(keys);
  };

  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(step: () => Promise<T>): Promise<T> => {
    const next = queue.then(step, step);
    queue = next.catch(() => undefined);
    return next;
  };

  const loadLock = async () =>
    (await chrome.storage.session.get(LOCK_KEY))[LOCK_KEY] as
      LockRecord | undefined;

  const fullscreen = async (windowId: number, lock: LockRecord) => {
    const win = await chrome.windows.get(windowId).catch(() => undefined);
    if (!win || win.type !== chrome.windows.WindowType.NORMAL) return;
    if (isFull(win.state)) return;
    lock.windows[String(windowId)] ??= win.state ?? 'normal';
    await chrome.storage.session.set({ [LOCK_KEY]: lock });
    await chrome.windows
      .update(windowId, { state: chrome.windows.WindowState.FULLSCREEN })
      .catch(() => undefined);
  };

  /** Covers the focused window's tab while Lock holds the student outside fullscreen; uncovers otherwise. */
  const cover = async () => {
    const state = await deps.load();
    const win = isLocking(state, deps.now())
      ? await lastNormalWindow()
      : undefined;
    const needs = win !== undefined && !isFull(win.state);
    const covered = await loadCovered();
    if (needs && win.id !== undefined) {
      const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
      // Our own pages carry their own fullscreen button and can't be scripted.
      if (tab?.id !== undefined && tab.url !== undefined) {
        if (!covered.includes(tab.id))
          await chrome.storage.session.set({
            [COVERED_KEY]: [...covered, tab.id],
          });
        await inject(tab.id, 'cover');
      }
      return;
    }
    if (!covered.length) return;
    await chrome.storage.session.remove(COVERED_KEY);
    await Promise.all(covered.map((id) => inject(id, 'none')));
  };

  const releaseLock = async () => {
    const lock = await loadLock();
    if (!lock) return;
    await chrome.storage.session.remove(LOCK_KEY);
    for (const [id, prev] of Object.entries(lock.windows)) {
      const win = await chrome.windows.get(Number(id)).catch(() => undefined);
      if (win?.state === chrome.windows.WindowState.FULLSCREEN)
        await chrome.windows
          .update(win.id ?? Number(id), { state: restoredState(prev) })
          .catch(() => undefined);
    }
    // Clears every web tab, in case a cover was injected that the record missed.
    const tabs = await allTabs();
    await chrome.storage.session.remove(COVERED_KEY);
    await Promise.all(
      tabs
        .filter((t) => /^https?:/.test(t.url))
        .map((t) => inject(t.id, 'none'))
    );
  };

  /** Brings tabs, rules and fullscreen in line with the session; runs after every state change and each minute. */
  const sync = async (state: FocusLocalState | null | undefined) => {
    // Not checked yet (after a restart): parked tabs keep waiting for the first answer.
    if (state === undefined) return;
    const now = deps.now();
    const blocking = isBlocking(state, now) ? state : null;
    const locking = isLocking(state, now) ? state : null;
    // Rules go first, so restored tabs aren't blocked on the way back.
    if (locking) await setLockRules(lockRules(locking, deps.origins));
    else await setLockRules([]);
    const tabs = await allTabs();
    for (const t of tabsToRestore(
      tabs,
      blocking,
      deps.origins,
      base,
      ownPages
    )) {
      restoring.set(t.id, deps.now());
      await chrome.tabs.update(t.id, { url: t.url }).catch(() => undefined);
    }
    if (blocking) {
      // Tabs open before the session have had no navigation to remember yet.
      const allowed = tabs.filter(
        (t) =>
          /^https?:/i.test(t.url) &&
          !isBlockedUrl(t.url, blocking, deps.origins, ownPages)
      );
      if (allowed.length)
        await chrome.storage.session.set(
          Object.fromEntries(
            allowed.map((t) => [`${TAB_KEY_PREFIX}${t.id}`, t.url])
          )
        );
    }
    if (blocking)
      for (const t of tabsToPark(tabs, blocking, deps.origins, ownPages)) {
        // Only a web page can come back; any other page is sent to the focus page instead.
        const parked = /^https?:/i.test(t.url)
          ? parkedUrl(base, t.url)
          : focusPageUrl(base, true);
        await rememberTab(t.id, parked);
        await chrome.tabs.update(t.id, { url: parked }).catch(() => undefined);
      }
    else await forgetTabs();
    if (!locking) {
      await releaseLock();
      await cover();
      return;
    }
    const lock = await loadLock();
    if (lock?.sessionId !== locking.session.sessionId) {
      // Lock starts by making the student's window fullscreen, once per session (F2).
      const fresh: LockRecord = {
        sessionId: locking.session.sessionId,
        windows: lock?.windows ?? {},
      };
      await chrome.storage.session.set({ [LOCK_KEY]: fresh });
      const win = await lastNormalWindow();
      if (win?.id !== undefined) await fullscreen(win.id, fresh);
    }
    await cover();
  };

  // One navigation per tab at a time, so two events for the same try can't each pick a different way back.
  const tabQueues = new Map<number, Promise<unknown>>();
  const perTab = <T>(tabId: number, step: () => Promise<T>): Promise<T> => {
    const next = (tabQueues.get(tabId) ?? Promise.resolve()).then(step, step);
    const tail = next.catch(() => undefined);
    tabQueues.set(tabId, tail);
    void tail.then(() => {
      if (tabQueues.get(tabId) === tail) tabQueues.delete(tabId);
    });
    return next;
  };

  /** A top-level navigation; true when it was blocked and counts as a try. */
  const navigated = async (
    tabId: number,
    url: string,
    currentUrl: string | undefined,
    committed: boolean
  ): Promise<boolean> => {
    const state = await deps.load();
    const now = deps.now();
    if (!isBlocking(state, now)) return false;
    const since = restoring.get(tabId);
    if (since !== undefined && now - since < RESTORING_MS) return false;
    if (!isBlockedUrl(url, state, deps.origins, ownPages)) {
      // Remember where an allowed tab is, so a late event can still send it back there rather than close it.
      // Only a page the tab actually showed, so a redirecting address can't become the way back.
      if (committed && /^https?:/i.test(url)) await rememberTab(tabId, url);
      return false;
    }
    const last = recent.get(tabId);
    const counted = !(last && last.url === url && now - last.at < SAME_TRY_MS);
    recent.set(tabId, { url, at: now });
    // Our own page (the focus page or a parked tab) goes back to exactly itself, keeping a parked tab's address.
    const own = (await ownPageUrls()).get(tabId);
    const back =
      own !== undefined && isFocusPage(own, base)
        ? own
        : currentUrl &&
            !isBlockedUrl(currentUrl, state, deps.origins, ownPages) &&
            /^https?:/i.test(currentUrl)
          ? currentUrl
          : await rememberedTab(tabId);
    const plan = returnPlan(
      tabId,
      back,
      await allTabs(),
      state,
      deps.origins,
      base
    );
    if (plan.kind === 'reload') {
      noticeOnLoad.add(plan.tabId);
      await chrome.tabs
        .update(plan.tabId, { url: plan.url })
        .catch(() => undefined);
    } else if (plan.kind === 'focus-page') {
      await chrome.tabs
        .update(plan.tabId, { url: focusPageUrl(base, true) })
        .catch(() => undefined);
    } else {
      const to = (await ownPageUrls()).get(plan.toTabId);
      if (to !== undefined && isFocusPage(to, base))
        await chrome.tabs
          .update(plan.toTabId, { url: focusPageUrl(base, true), active: true })
          .catch(() => undefined);
      else {
        await chrome.tabs
          .update(plan.toTabId, { active: true })
          .catch(() => undefined);
        await inject(plan.toTabId, 'notice');
      }
      await chrome.windows
        .update(plan.toWindowId, { focused: true })
        .catch(() => undefined);
      await chrome.tabs.remove(plan.closeTabId).catch(() => undefined);
    }
    return counted;
  };

  return {
    sync: (state: FocusLocalState | null | undefined) =>
      serial(() => sync(state)),
    navigated: (
      tabId: number,
      url: string,
      currentUrl: string | undefined,
      committed: boolean
    ) => perTab(tabId, () => navigated(tabId, url, currentUrl, committed)),
    /** A tab finished loading or became active: show a pending notice, and cover it in Lock outside fullscreen. */
    tabShown: async (tabId: number) => {
      if (noticeOnLoad.delete(tabId)) await inject(tabId, 'notice');
      await serial(cover);
    },
    windowChanged: () => serial(cover),
    tabClosed: (tabId: number) => {
      noticeOnLoad.delete(tabId);
      recent.delete(tabId);
      restoring.delete(tabId);
      void chrome.storage.session
        .remove(`${TAB_KEY_PREFIX}${tabId}`)
        .catch(() => undefined);
    },
    /** The cover's button: only while Lock holds the student. */
    returnToFullscreen: (windowId: number) =>
      serial(async () => {
        const state = await deps.load();
        if (!isLocking(state, deps.now())) return;
        const lock = (await loadLock()) ?? {
          sessionId: state.session.sessionId,
          windows: {},
        };
        await fullscreen(windowId, lock);
      }),
    /** Whether the student's window is fullscreen; Lock counts time outside it as away (F2). */
    activeFullscreen: async () => {
      const win = await lastNormalWindow();
      return !win || isFull(win.state);
    },
  };
}
