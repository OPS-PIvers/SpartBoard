import {
  EXTENSION_PROTOCOL_VERSION,
  parseExtensionMessage,
  type ExtensionInstall,
  type ExtensionProfile,
  type ExtensionReply,
  type ExtensionUpdateStatus,
  type WebTourCheckStartMessage,
  type WebTourStartMessage,
} from '@/components/tours/web/extensionProtocol';
import { isTrustedSender } from './sender';

interface HandlerDeps {
  origins: readonly string[];
  version: string;
  getProfile: () => Promise<ExtensionProfile>;
  /** How Chrome got this extension; undefined when it can't be read. */
  getInstall?: () => Promise<ExtensionInstall | undefined>;
  /** Opens the tour's first page and starts playback there; resolves to the new tab's id. */
  startWebTour?: (
    message: WebTourStartMessage | WebTourCheckStartMessage
  ) => Promise<number>;
  /** Loads a published tour by id and opens it; null when it couldn't be loaded (H4). */
  openWebTour?: (setId: string) => Promise<number | null>;
  /** Whether Chrome holds a Google sign-in for the extension; `ask` shows Google's prompt when it doesn't. */
  signIn?: (ask: boolean) => Promise<boolean>;
  /** Asks Chrome for a newer version; on `available` the extension reloads after replying. */
  checkForUpdate?: () => Promise<ExtensionUpdateStatus>;
}

/** Answers one external message; null means the sender is not trusted and gets no reply. */
export function createExternalHandler({
  origins,
  version,
  getProfile,
  getInstall,
  startWebTour,
  openWebTour,
  signIn,
  checkForUpdate,
}: HandlerDeps) {
  return async (
    raw: unknown,
    sender: chrome.runtime.MessageSender
  ): Promise<ExtensionReply | null> => {
    if (!isTrustedSender(sender, origins)) return null;
    const parsed = parseExtensionMessage(raw);
    if (parsed.kind !== 'ok') return { ok: false, error: parsed.kind };
    const profile = await getProfile();
    if (parsed.staffOnly && profile !== 'staff') {
      return { ok: false, error: 'refused' };
    }
    switch (parsed.message.type) {
      case 'ping': {
        const install = await getInstall?.();
        return {
          ok: true,
          protocol: EXTENSION_PROTOCOL_VERSION,
          version,
          profile,
          ...(install ? { install } : {}),
        };
      }
      case 'web-tour/start':
      case 'web-tour/check':
        if (!startWebTour) return { ok: false, error: 'unsupported' };
        return { ok: true, tabId: await startWebTour(parsed.message) };
      case 'web-tour/open': {
        if (!openWebTour) return { ok: false, error: 'unsupported' };
        const tabId = await openWebTour(parsed.message.setId);
        return tabId === null
          ? { ok: false, error: 'unavailable' }
          : { ok: true, tabId };
      }
      case 'schoology/signed-in':
      case 'schoology/connect':
        if (!signIn) return { ok: false, error: 'unsupported' };
        return {
          ok: true,
          signedIn: await signIn(parsed.message.type === 'schoology/connect'),
        };
      case 'extension/update':
        if (!checkForUpdate) return { ok: false, error: 'unsupported' };
        return { ok: true, update: await checkForUpdate() };
    }
  };
}
