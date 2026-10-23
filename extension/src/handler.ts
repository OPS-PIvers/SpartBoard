import {
  EXTENSION_PROTOCOL_VERSION,
  parseExtensionMessage,
  type ExtensionProfile,
  type ExtensionReply,
  type WebTourCheckStartMessage,
  type WebTourStartMessage,
} from '@/components/tours/web/extensionProtocol';
import { isTrustedSender } from './sender';

interface HandlerDeps {
  origins: readonly string[];
  version: string;
  getProfile: () => Promise<ExtensionProfile>;
  /** Opens the tour's first page and starts playback there; resolves to the new tab's id. */
  startWebTour?: (
    message: WebTourStartMessage | WebTourCheckStartMessage
  ) => Promise<number>;
}

/** Answers one external message; null means the sender is not trusted and gets no reply. */
export function createExternalHandler({
  origins,
  version,
  getProfile,
  startWebTour,
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
      case 'ping':
        return {
          ok: true,
          protocol: EXTENSION_PROTOCOL_VERSION,
          version,
          profile,
        };
      case 'web-tour/start':
      case 'web-tour/check':
        if (!startWebTour) return { ok: false, error: 'unsupported' };
        return { ok: true, tabId: await startWebTour(parsed.message) };
    }
  };
}
