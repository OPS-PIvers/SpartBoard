import { createExternalHandler } from './handler';
import { LISTINGS } from './listings';
import { getChromeProfile } from './profile';
import { isTrustedSender } from './sender';

declare const __SPART_LISTING__: 'prod' | 'dev';

const { origins } = LISTINGS[__SPART_LISTING__];
const handle = createExternalHandler({
  origins,
  version: chrome.runtime.getManifest().version,
  getProfile: getChromeProfile,
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

// No page ports yet; refuse them until a protocol version defines one.
chrome.runtime.onConnectExternal.addListener((port) => port.disconnect());
