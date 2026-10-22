import type { PlaybackHost } from './controller';

/** The real Chrome APIs behind playback; the files are the content-script bundles the build writes. */
export function chromeHost(post: PlaybackHost['post']): PlaybackHost {
  return {
    openTab: async (url) => {
      const tab = await chrome.tabs.create({ url, active: true });
      if (tab.id === undefined) throw new Error('tab has no id');
      return tab.id;
    },
    frames: async (tabId) =>
      ((await chrome.webNavigation.getAllFrames({ tabId })) ?? []).map((f) => ({
        frameId: f.frameId,
        parentFrameId: f.parentFrameId,
        url: f.url,
      })),
    inject: async (tabId, frameIds, overlay) => {
      const files = overlay ? ['locator.js', 'overlay.js'] : ['locator.js'];
      try {
        await chrome.scripting.executeScript({ target: { tabId, frameIds }, files });
      } catch {
        // A frame on a page Chrome won't script (the Web Store, chrome://) just never reports.
      }
    },
    sendToFrame: (tabId, frameId, msg) => {
      chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => {
        // The frame navigated away or has no listener yet; the next commit re-sends.
      });
    },
    load: async <T>(key: string) =>
      (await chrome.storage.session.get(key))[key] as T | undefined,
    save: (entries) => chrome.storage.session.set(entries),
    remove: (keys) => chrome.storage.session.remove(keys),
    post,
    setTimer: (ms, cb) => {
      setTimeout(cb, ms);
    },
    now: () => Date.now(),
  };
}
