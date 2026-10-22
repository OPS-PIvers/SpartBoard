import {
  WEB_TOUR_PORT,
  type ExtensionProfile,
  type WebTourProgressMessage,
  type WebTourStartTour,
} from './extensionProtocol';

/** The protocol that added web tour playback. */
export const WEB_TOUR_PROTOCOL = 2;

/** The protocol that added Fix on site (`recorder/repick`). */
export const REPICK_PROTOCOL = 3;

export type WebTourPortEvent = WebTourProgressMessage;

export type ExtensionStatus =
  | { kind: 'none' }
  | {
      kind: 'ready';
      protocol: number;
      version: string;
      profile: ExtensionProfile;
    };

interface ChromePort {
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: { addListener: (cb: (message: unknown) => void) => void };
  onDisconnect: { addListener: (cb: () => void) => void };
}

interface ChromeRuntime {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (reply: unknown) => void
  ) => void;
  connect: (extensionId: string, info: { name: string }) => ChromePort;
  lastError?: unknown;
}

const PING_TIMEOUT_MS = 1500;

/** The listing id for this build, or null when the build has none. */
export const extensionId = (): string | null => {
  const id: unknown = import.meta.env.VITE_SPART_EXTENSION_ID;
  return typeof id === 'string' && /^[a-p]{32}$/.test(id) ? id : null;
};

const runtime = (): ChromeRuntime | null => {
  const chrome = (globalThis as { chrome?: { runtime?: ChromeRuntime } })
    .chrome;
  return typeof chrome?.runtime?.sendMessage === 'function'
    ? chrome.runtime
    : null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Sends one message; resolves null when the extension is missing, silent or slow. */
function send(message: unknown, timeoutMs: number): Promise<unknown> {
  const id = extensionId();
  const rt = runtime();
  if (!id || !rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      rt.sendMessage(id, message, (reply) => {
        clearTimeout(timer);
        // Reading lastError marks it handled; a non-listed origin gets no reply.
        resolve(rt.lastError ? null : reply);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Reads a ping reply; anything malformed counts as no extension. */
export function parsePing(reply: unknown): ExtensionStatus {
  if (!isRecord(reply) || reply.ok !== true) return { kind: 'none' };
  const { protocol, version, profile } = reply;
  if (!Number.isInteger(protocol) || typeof version !== 'string') {
    return { kind: 'none' };
  }
  return {
    kind: 'ready',
    protocol: protocol as number,
    version,
    profile: profile === 'staff' || profile === 'other' ? profile : 'none',
  };
}

export async function pingExtension(): Promise<ExtensionStatus> {
  return parsePing(await send({ type: 'ping' }, PING_TIMEOUT_MS));
}

/** Whether this extension can play a web tour for this browser profile. */
export const canPlayWebTours = (status: ExtensionStatus): boolean =>
  status.kind === 'ready' &&
  status.protocol >= WEB_TOUR_PROTOCOL &&
  status.profile === 'staff';

export type StartResult =
  { ok: true; tabId: number } | { ok: false; error: string };

/** Hands the tour over and opens its site; a start for the same set replaces the old one. */
export async function startWebTour(
  tour: WebTourStartTour,
  startUrl: string,
  stepIndex: number
): Promise<StartResult> {
  const reply = await send(
    { type: 'web-tour/start', startUrl, stepIndex, tour },
    30_000
  );
  if (isRecord(reply) && reply.ok === true && Number.isInteger(reply.tabId)) {
    return { ok: true, tabId: reply.tabId as number };
  }
  const error =
    isRecord(reply) && typeof reply.error === 'string'
      ? reply.error
      : 'no-reply';
  return { ok: false, error };
}

/** Listens to the tour's progress until the returned cleanup runs; onGone fires if the port drops. */
export function watchWebTour(
  setId: string,
  onEvent: (event: WebTourPortEvent) => void,
  onGone: () => void
): () => void {
  const id = extensionId();
  const rt = runtime();
  if (!id || !rt) {
    onGone();
    return () => undefined;
  }
  let port: ChromePort;
  try {
    port = rt.connect(id, { name: WEB_TOUR_PORT });
  } catch {
    onGone();
    return () => undefined;
  }
  let closed = false;
  port.onMessage.addListener((message) => {
    const event = parseWebTourPortEvent(message, setId);
    if (event && !closed) onEvent(event);
  });
  port.onDisconnect.addListener(() => {
    if (!closed) onGone();
  });
  port.postMessage({ type: 'web-tour/watch', setId });
  return () => {
    closed = true;
    port.disconnect();
  };
}

/** Validates one port message from the extension for this set, or null. */
export function parseWebTourPortEvent(
  message: unknown,
  setId: string
): WebTourPortEvent | null {
  if (!isRecord(message) || message.setId !== setId) return null;
  const index = message.stepIndex;
  const validIndex = Number.isInteger(index) && (index as number) >= 0;
  switch (message.type) {
    case 'web-tour/step': {
      const { stepId, match } = message;
      if (!validIndex || typeof stepId !== 'string') return null;
      if (
        match !== 'role' &&
        match !== 'text' &&
        match !== 'css' &&
        match !== 'none'
      ) {
        return null;
      }
      return {
        type: 'web-tour/step',
        setId,
        stepIndex: index as number,
        stepId,
        match,
      };
    }
    case 'web-tour/done':
      return { type: 'web-tour/done', setId };
    case 'web-tour/exit':
    case 'web-tour/closed':
      return validIndex
        ? { type: message.type, setId, stepIndex: index as number }
        : null;
    default:
      return null;
  }
}
