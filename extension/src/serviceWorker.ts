import {
  parseWebTourPortMessage,
  WEB_TOUR_PORT,
  type WebTourProgressMessage,
} from '@/components/tours/web/extensionProtocol';
import { createExternalHandler } from './handler';
import { getChromeProfile } from './profile';
import { RECORDER_PORT } from '@/components/tours/web/recorderProtocol';
import { handleRecorderPort, installRecorder } from './recorder/worker';
import { isTrustedSender } from './sender';
import { chromeHost, PLAYBACK_ALARM } from './playback/chromeHost';
import { createPlaybackController } from './playback/controller';
import {
  isFrameReport,
  isOverlayActionMessage,
} from './playback/internalMessages';
import { toPlayback } from './playback/startMessage';

// The listing's exact origins, inlined at build time so a bundle carries only its own.
declare const __SPART_ORIGINS__: readonly string[];

const origins = __SPART_ORIGINS__;

// Pages following a tour's progress, by set id; a restarted worker loses them and the page reconnects.
const watchers = new Map<string, Set<chrome.runtime.Port>>();
const post = (setId: string, msg: WebTourProgressMessage) => {
  for (const port of watchers.get(setId) ?? []) {
    try {
      port.postMessage(msg);
    } catch {
      watchers.get(setId)?.delete(port);
    }
  }
};

const playback = createPlaybackController(chromeHost(post));

const handle = createExternalHandler({
  origins,
  version: chrome.runtime.getManifest().version,
  getProfile: getChromeProfile,
  startWebTour: (message) => playback.start(toPlayback(message)),
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

installRecorder();

chrome.runtime.onConnectExternal.addListener((port) => {
  if (
    port.name === RECORDER_PORT &&
    isTrustedSender(port.sender ?? {}, origins)
  ) {
    handleRecorderPort(port);
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
      const set = watchers.get(msg.setId) ?? new Set();
      set.add(port);
      watchers.set(msg.setId, set);
      // A page that reconnects after the worker idled catches up on the step it missed.
      return playback.replay(msg.setId).then((missed) => {
        for (const m of missed) port.postMessage(m);
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
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void playback.tabClosed(tabId);
});
