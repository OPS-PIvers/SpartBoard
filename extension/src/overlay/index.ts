import css from './overlay.css?inline';
import { mountOverlay, type OverlayHandle } from './mount';
import { parseOverlayState } from './overlayState';

// Injected on demand into a tab playing a tour (T8); only the extension's own service worker drives it.
let overlay: OverlayHandle | null = null;

const fromServiceWorker = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id &&
  sender.tab === undefined &&
  sender.url === chrome.runtime.getURL('service-worker.js');

// A second injection into the same document must not add a second listener and overlay.
const LOADED = Symbol.for('spartboard.overlay.loaded');
const scope = globalThis as typeof globalThis & { [LOADED]?: true };

if (!scope[LOADED]) {
  scope[LOADED] = true;
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (
      !fromServiceWorker(sender) ||
      typeof message !== 'object' ||
      message === null
    ) {
      return false;
    }
    const { type, state } = message as { type?: unknown; state?: unknown };
    if (type === 'overlay/unmount') {
      overlay?.unmount();
      overlay = null;
    } else if (type === 'overlay/render') {
      const parsed = parseOverlayState(state);
      if (!parsed) return false;
      overlay ??= mountOverlay(css, (action) => {
        chrome.runtime
          .sendMessage({ type: 'overlay/action', action })
          .catch(() => {
            // No listener until playback lands (slice 6).
          });
      });
      overlay.render(parsed);
    }
    return false;
  });
}
