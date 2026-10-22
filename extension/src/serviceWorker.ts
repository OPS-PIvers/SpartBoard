import { createExternalHandler } from './handler';
import { getChromeProfile } from './profile';
import { RECORDER_PORT } from '@/components/tours/web/recorderProtocol';
import { handleRecorderPort, installRecorder } from './recorder/worker';
import { isTrustedSender } from './sender';

// The listing's exact origins, inlined at build time so a bundle carries only its own.
declare const __SPART_ORIGINS__: readonly string[];

const origins = __SPART_ORIGINS__;
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

installRecorder();

// The recorder port is the only page port; anything else is closed at once.
chrome.runtime.onConnectExternal.addListener((port) => {
  if (
    port.name === RECORDER_PORT &&
    port.sender &&
    isTrustedSender(port.sender, origins)
  )
    handleRecorderPort(port);
  else port.disconnect();
});
