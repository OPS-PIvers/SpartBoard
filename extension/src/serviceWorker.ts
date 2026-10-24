import {
  parseWebTourPortMessage,
  progressForPage,
  WEB_TOUR_PORT,
  type WebTourPortPost,
} from '@/components/tours/web/extensionProtocol';
import { createExternalHandler } from './handler';
import { getChromeProfile } from './profile';
import {
  INTAKE_PORT,
  RECORDER_PORT,
} from '@/components/tours/web/recorderProtocol';
import {
  handleIntakePort,
  handleRecorderPort,
  installRecorder,
} from './recorder/worker';
import { isTrustedSender } from './sender';
import { chromeHost, PLAYBACK_ALARM } from './playback/chromeHost';
import { createPlaybackController } from './playback/controller';
import {
  isFrameReport,
  isOverlayActionMessage,
} from './playback/internalMessages';
import { toPlayback } from './playback/startMessage';
import { openedTour } from './playback/openTour';
import { createRunRecorder } from './playback/runRecorder';
import {
  callSpartBoard,
  chromeTokens,
  type ApiDeps,
  type ApiFailure,
} from './spartboardApi';
import type { TourRun } from '@/components/tours/tourRunLog';
import {
  pageHost,
  parseTourPanelMessage,
  TOUR_LIST_ALARM,
  TOUR_LIST_KEY,
  TOUR_LIST_REFRESH_MINUTES,
  type TourListCache,
  type TourListReply,
  type TourStartReply,
} from './tourList';
import { createTourListWorker } from './tourListWorker';

// The listing's exact origins, inlined at build time so a bundle carries only its own.
declare const __SPART_ORIGINS__: readonly string[];

const origins = __SPART_ORIGINS__;
// This listing's SpartBoard functions (WEB_TOURS_HELP_PANEL.md H7).
declare const __SPART_FUNCTIONS__: string;

const api: ApiDeps = {
  base: __SPART_FUNCTIONS__,
  ...chromeTokens,
  fetch: (input, init) => fetch(input, init),
};

const runs = createRunRecorder({
  load: async <T>(key: string) =>
    (await chrome.storage.session.get(key))[key] as T | undefined,
  save: (entries) => chrome.storage.session.set(entries),
  remove: (keys) => chrome.storage.session.remove(keys),
  send: async (setId: string, run: TourRun) => {
    await callSpartBoard(api, 'webTourRunV1', { setId, run });
  },
});

// Pages following a tour's progress, by set id; a restarted worker loses them and the page reconnects.
const watchers = new Map<string, Set<chrome.runtime.Port>>();
// The protocol each watching page reads; a page from before protocol 4 never says.
const watcherProtocols = new WeakMap<chrome.runtime.Port, number>();
const toPage = (port: chrome.runtime.Port, msg: WebTourPortPost) => {
  const out = progressForPage(msg, watcherProtocols.get(port) ?? 0);
  if (out) port.postMessage(out);
};
const post = (setId: string, msg: WebTourPortPost) => {
  void runs.onPost(msg);
  for (const port of watchers.get(setId) ?? []) {
    try {
      toPage(port, msg);
    } catch {
      watchers.get(setId)?.delete(port);
    }
  }
};

const playback = createPlaybackController(chromeHost(post));

/** Loads a published tour and arms it, in `tab` when that's already on the tour's site (H5). */
async function openPublished(
  setId: string,
  tab?: chrome.tabs.Tab | null
): Promise<{ ok: true; tabId: number } | { ok: false; why: ApiFailure }> {
  // Interactive, since a click started it and Chrome may need to ask once.
  const loaded = await callSpartBoard(api, 'webTourLoadV1', { setId }, true);
  if (!loaded.ok) return loaded;
  const opened = openedTour(setId, loaded.value);
  if (!opened) return { ok: false, why: 'not-found' };
  const here =
    tab?.id !== undefined &&
    pageHost(tab.url) === pageHost(opened.start.tour.startUrl);
  const tabId = await playback.start(opened.start, here ? tab.id : undefined);
  await runs.begin(setId, opened.start.version, opened.locators);
  return { ok: true, tabId };
}

const loadList = async () =>
  (await chrome.storage.local.get(TOUR_LIST_KEY))[TOUR_LIST_KEY] as
    TourListCache | undefined;

const tourList = createTourListWorker({
  list: (interactive) => callSpartBoard(api, 'webToursListV1', {}, interactive),
  load: loadList,
  save: (list) =>
    list
      ? chrome.storage.local.set({ [TOUR_LIST_KEY]: list })
      : chrome.storage.local.remove(TOUR_LIST_KEY),
  tabs: () => chrome.tabs.query({}),
  setBadge: (tabId, text) => chrome.action.setBadgeText({ tabId, text }),
  now: () => Date.now(),
});

const handle = createExternalHandler({
  origins,
  version: chrome.runtime.getManifest().version,
  getProfile: getChromeProfile,
  // Starting ends any other tour first, so its exit reaches its run before a new run begins.
  startWebTour: async (message) => {
    const tabId = await playback.start(toPlayback(message));
    await runs.forget(message.tour.setId);
    return tabId;
  },
  openWebTour: async (setId) => {
    const opened = await openPublished(setId);
    return opened.ok ? opened.tabId : null;
  },
});

chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    // Untrusted senders get no reply at all, so the channel closes at once.
    if (!isTrustedSender(sender, origins)) return false;
    handle(message, sender).then(
      (reply) => sendResponse(reply ?? { ok: false, error: 'refused' }),
      () => sendResponse({ ok: false, error: 'invalid' })
    );
    return true;
  }
);

installRecorder(origins);

chrome.runtime.onConnectExternal.addListener((port) => {
  if (
    port.name === RECORDER_PORT &&
    isTrustedSender(port.sender ?? {}, origins)
  ) {
    handleRecorderPort(port);
    return;
  }
  if (
    port.name === INTAKE_PORT &&
    isTrustedSender(port.sender ?? {}, origins)
  ) {
    handleIntakePort(port);
    return;
  }
  if (
    port.name !== WEB_TOUR_PORT ||
    !isTrustedSender(port.sender ?? {}, origins)
  ) {
    port.disconnect();
    return;
  }
  // Progress is staff-only like the tours themselves (D3).
  const allowed = getChromeProfile().then((p) => p === 'staff');
  port.onMessage.addListener((raw: unknown) => {
    void allowed.then((ok) => {
      const msg = ok ? parseWebTourPortMessage(raw) : null;
      if (!msg) {
        port.disconnect();
        return;
      }
      watcherProtocols.set(port, msg.protocol ?? 0);
      const set = watchers.get(msg.setId) ?? new Set();
      set.add(port);
      watchers.set(msg.setId, set);
      // A page that reconnects after the worker idled catches up on the step it missed.
      return playback.replay(msg.setId).then((missed) => {
        for (const m of missed) toPage(port, m);
      });
    });
  });
  port.onDisconnect.addListener(() => {
    for (const set of watchers.values()) set.delete(port);
  });
});

// Messages from our own content scripts in a tab that is playing a tour.
chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const tabId = sender.tab?.id;
  if (
    sender.id !== chrome.runtime.id ||
    tabId === undefined ||
    sender.frameId === undefined
  ) {
    return false;
  }
  if (isFrameReport(message)) {
    void playback.frameReport(tabId, sender.frameId, message);
  } else if (isOverlayActionMessage(message)) {
    void playback.overlayAction(tabId, sender.frameId, message.action);
  }
  return false;
});

// T7: re-inject on every new document or frame, and re-seek on in-app route changes.
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  void playback.committed(tabId, frameId, url);
});
chrome.webNavigation.onHistoryStateUpdated.addListener(
  ({ tabId, frameId, url }) => {
    void playback.historyChanged(tabId, frameId, url);
  }
);
// Hash-routed apps change only the fragment.
chrome.webNavigation.onReferenceFragmentUpdated.addListener(
  ({ tabId, frameId, url }) => {
    void playback.historyChanged(tabId, frameId, url);
  }
);
chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === PLAYBACK_ALARM) void playback.sweep();
  if (name === TOUR_LIST_ALARM) void tourList.refresh();
});

// The Tours tab (H5): only our own side panel, an extension page rather than a tab, may ask.
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  const msg = parseTourPanelMessage(message);
  if (!msg) return false;
  const answer = async (): Promise<TourListReply | TourStartReply> => {
    if ((await getChromeProfile()) !== 'staff')
      return { ok: false, why: 'signed-out' };
    if (msg.type === 'tours/list') {
      const cached = msg.refresh ? undefined : await loadList();
      return cached ? { ok: true, list: cached } : tourList.refresh(true);
    }
    const tab =
      msg.tabId === null
        ? null
        : await chrome.tabs.get(msg.tabId).catch(() => null);
    const opened = await openPublished(msg.setId, tab);
    return opened.ok ? { ok: true } : opened;
  };
  answer().then(reply, () => reply({ ok: false, why: 'offline' }));
  return true;
});

// H6: the badge counts this site's tours from the cached list, refreshed every 6 hours and when the panel opens.
void chrome.action.setBadgeBackgroundColor({ color: '#2d3f89' });
void chrome.alarms.get(TOUR_LIST_ALARM).then((alarm) => {
  if (alarm) return;
  void chrome.alarms.create(TOUR_LIST_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: TOUR_LIST_REFRESH_MINUTES,
  });
});
chrome.runtime.onStartup.addListener(() => void tourList.refresh());
chrome.runtime.onInstalled.addListener(() => void tourList.refresh());
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url !== undefined || change.status === 'complete')
    void tourList.badge(tabId, tab.url);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void playback.tabClosed(tabId);
});
