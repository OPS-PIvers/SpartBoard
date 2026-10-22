import { installFrameSeeker, isFrameCommand } from './frameScript';

// Injected into every frame of a tab playing a tour (T8); takes commands only from the service worker.
const LOADED = Symbol.for('spartboard.locator.loaded');
const scope = globalThis as typeof globalThis & { [LOADED]?: true };

const fromServiceWorker = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id &&
  sender.tab === undefined &&
  sender.url === chrome.runtime.getURL('service-worker.js');

if (!scope[LOADED]) {
  scope[LOADED] = true;
  const run = installFrameSeeker(document, (report) => {
    chrome.runtime.sendMessage(report).catch(() => {
      // The service worker is restarting; the next seek asks again.
    });
  });
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (fromServiceWorker(sender) && isFrameCommand(message)) run(message);
    return false;
  });
}
