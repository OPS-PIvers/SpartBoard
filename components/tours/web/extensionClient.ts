import {
  CHECK_PROTOCOL,
  EXTENSION_PROTOCOL_VERSION,
  isCheckRunId,
  OPEN_PROTOCOL,
  parseWebTourLocator,
  SCHOOLOGY_CONNECT_PROTOCOL,
  SCORED_MATCH_PROTOCOL,
  WEB_TOUR_PORT,
  type ExtensionProfile,
  type WebTourCheckProgress,
  type WebTourProgressMessage,
  type WebTourStartTour,
  type WebTourSuggestPost,
} from './extensionProtocol';

/** The protocol that added web tour playback. */
export const WEB_TOUR_PROTOCOL = 2;

/** The protocol that added Fix on site (`recorder/repick`). */
export const REPICK_PROTOCOL = 3;

export type WebTourPortEvent = WebTourProgressMessage | WebTourSuggestPost;

export type WebTourCheckEvent = WebTourCheckProgress | WebTourSuggestPost;

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

/** Whether this extension can play a draft in check mode (C12) for this browser profile. */
export const canCheckWebTours = (status: ExtensionStatus): boolean =>
  canPlayWebTours(status) &&
  status.kind === 'ready' &&
  status.protocol >= CHECK_PROTOCOL;

export type StartResult =
  { ok: true; tabId: number } | { ok: false; error: string };

/** Hands the tour over and opens its site; a start for the same set replaces the old one. */
export async function startWebTour(
  tour: WebTourStartTour,
  startUrl: string,
  stepIndex: number,
  // A check run id plays in check mode, which only a protocol 6 extension knows; callers gate on canCheckWebTours.
  checkRunId?: string
): Promise<StartResult> {
  const reply = await send(
    checkRunId
      ? {
          type: 'web-tour/check',
          startUrl,
          stepIndex,
          tour,
          runId: checkRunId,
        }
      : { type: 'web-tour/start', startUrl, stepIndex, tour },
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

/** Whether this extension loads and opens a tour from its id alone (protocol 8), so the page needs no sign-in. */
export const canOpenWebTours = (status: ExtensionStatus): boolean =>
  canPlayWebTours(status) &&
  status.kind === 'ready' &&
  status.protocol >= OPEN_PROTOCOL;

/** Asks the extension to load the published tour and open it; any failure means the page hands the tour over itself. */
export async function openWebTour(setId: string): Promise<StartResult> {
  const reply = await send({ type: 'web-tour/open', setId }, 60_000);
  if (isRecord(reply) && reply.ok === true && Number.isInteger(reply.tabId)) {
    return { ok: true, tabId: reply.tabId as number };
  }
  return {
    ok: false,
    error:
      isRecord(reply) && typeof reply.error === 'string'
        ? reply.error
        : 'no-reply',
  };
}

/** Whether a staff profile's extension can be signed in from the page (protocol 11). */
export const canConnectSchoology = (status: ExtensionStatus): boolean =>
  status.kind === 'ready' &&
  status.profile === 'staff' &&
  status.protocol >= SCHOOLOGY_CONNECT_PROTOCOL;

const signedInReply = (reply: unknown): boolean | null =>
  isRecord(reply) && reply.ok === true && typeof reply.signedIn === 'boolean'
    ? reply.signedIn
    : null;

/** Whether the extension holds a Google sign-in; null when it didn't answer. */
export async function extensionSignedIn(): Promise<boolean | null> {
  return signedInReply(
    await send({ type: 'schoology/signed-in' }, PING_TIMEOUT_MS)
  );
}

/** Has the extension show Google's sign-in prompt; true once it holds a sign-in. */
export async function connectExtension(): Promise<boolean> {
  // The teacher may take a while in Google's window.
  return (
    signedInReply(await send({ type: 'schoology/connect' }, 300_000)) === true
  );
}

/** Listens to the tour's progress until the returned cleanup runs; onGone fires if the port drops. */
export function watchWebTour(
  setId: string,
  onEvent: (event: WebTourPortEvent) => void,
  onGone: () => void,
  extensionProtocol = 0
): () => void {
  return openWatch(
    setId,
    (m) => parseWebTourPortEvent(m, setId),
    onEvent,
    onGone,
    extensionProtocol
  );
}

/** Listens to a check run's results; only a protocol 6 extension sends them, and only to a page that says it reads them. */
export function watchWebTourCheck(
  setId: string,
  onEvent: (event: WebTourCheckEvent) => void,
  onGone: () => void
): () => void {
  return openWatch(
    setId,
    (m) => parseWebTourCheckEvent(m, setId),
    onEvent,
    onGone,
    CHECK_PROTOCOL
  );
}

function openWatch<E>(
  setId: string,
  parse: (message: unknown) => E | null,
  onEvent: (event: E) => void,
  onGone: () => void,
  extensionProtocol: number
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
    const event = parse(message);
    if (event && !closed) onEvent(event);
  });
  port.onDisconnect.addListener(() => {
    if (!closed) onGone();
  });
  // Only a protocol 4 extension accepts the extra key.
  port.postMessage(
    extensionProtocol >= SCORED_MATCH_PROTOCOL
      ? { type: 'web-tour/watch', setId, protocol: EXTENSION_PROTOCOL_VERSION }
      : { type: 'web-tour/watch', setId }
  );
  return () => {
    closed = true;
    port.disconnect();
  };
}

const CHECK_RESULTS = ['found', 'weak', 'ambiguous', 'none'] as const;

/** A suggestion for this set; a check run's carries its run id, a playing run's none. */
export function parseWebTourSuggest(
  message: unknown,
  setId: string
): WebTourSuggestPost | null {
  if (!isRecord(message) || message.type !== 'web-tour/suggest') return null;
  if (message.setId !== setId) return null;
  const { stepIndex, stepId, runId } = message;
  if (!Number.isInteger(stepIndex) || (stepIndex as number) < 0) return null;
  if (typeof stepId !== 'string' || !stepId || stepId.length > 200) return null;
  if (runId !== undefined && !isCheckRunId(runId)) return null;
  const raw = message.locator;
  // The extension sends one frame's clues; frames stay the step's own.
  if (isRecord(raw) && 'frames' in raw) return null;
  const locator = parseWebTourLocator(raw);
  if (!locator) return null;
  return {
    type: 'web-tour/suggest',
    setId,
    stepIndex: stepIndex as number,
    stepId,
    locator,
    ...(typeof runId === 'string' ? { runId } : {}),
  };
}

/** Validates one check-run message from the extension for this set, or null. */
export function parseWebTourCheckEvent(
  message: unknown,
  setId: string
): WebTourCheckEvent | null {
  if (!isRecord(message) || message.setId !== setId) return null;
  const { runId } = message;
  if (!isCheckRunId(runId)) return null;
  if (message.type === 'web-tour/suggest')
    return parseWebTourSuggest(message, setId);
  const index = message.stepIndex;
  if (!Number.isInteger(index) || (index as number) < 0) return null;
  const stepIndex = index as number;
  if (message.type === 'web-tour/check-end') {
    return typeof message.done === 'boolean'
      ? {
          type: 'web-tour/check-end',
          setId,
          runId,
          stepIndex,
          done: message.done,
        }
      : null;
  }
  if (message.type !== 'web-tour/check-step') return null;
  const { stepId } = message;
  const result = CHECK_RESULTS.find((r) => r === message.result);
  if (typeof stepId !== 'string' || !result) return null;
  return {
    type: 'web-tour/check-step',
    setId,
    runId,
    stepIndex,
    stepId,
    result,
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
        match !== 'score' &&
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
    case 'web-tour/suggest':
      // A check run's suggestion is the editor's, never a run's.
      return message.runId === undefined
        ? parseWebTourSuggest(message, setId)
        : null;
    case 'web-tour/exit':
    case 'web-tour/closed':
      return validIndex
        ? { type: message.type, setId, stepIndex: index as number }
        : null;
    default:
      return null;
  }
}
