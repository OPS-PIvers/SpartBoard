import { locate, type LocatorClue, type WebLocatorClues } from './locate';
import type { WebStepAction } from './progress';

/** Messages the service worker sends to every frame of a playing tab. */
export type FrameCommand =
  | { type: 'wt:seek'; token: string; clues: WebLocatorClues; action: WebStepAction }
  | { type: 'wt:stop' };

/** Messages a frame reports back. */
export type FrameReport =
  | { type: 'wt:found'; token: string; clue: LocatorClue; tied: boolean; url: string }
  | { type: 'wt:lost'; token: string }
  | { type: 'wt:acted'; token: string };

/** Shared with the overlay script, which runs in the same isolated world. */
export interface FrameTarget {
  token: string;
  el: Element;
}

declare global {
  // eslint-disable-next-line no-var
  var __sbWebTourFrame: { target: FrameTarget | null } | undefined;
}

const ACT_EVENTS: Record<WebStepAction, string[]> = {
  observe: [],
  click: ['click'],
  type: ['change'],
  select: ['change'],
};

const RESEEK_MS = 250;

export function isFrameCommand(msg: unknown): msg is FrameCommand {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (m.type === 'wt:stop') return true;
  return (
    m.type === 'wt:seek' &&
    typeof m.token === 'string' &&
    typeof m.clues === 'object' &&
    m.clues !== null &&
    typeof m.action === 'string' &&
    m.action in ACT_EVENTS
  );
}

/** Watches this frame for the current step's target and reports what it finds; never acts on the page. */
export function installFrameSeeker(
  doc: Document,
  send: (report: FrameReport) => void
): (cmd: FrameCommand) => void {
  const shared = (globalThis.__sbWebTourFrame ??= { target: null });
  let seek: Extract<FrameCommand, { type: 'wt:seek' }> | null = null;
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let detach: (() => void) | null = null;

  const clearTarget = () => {
    detach?.();
    detach = null;
    shared.target = null;
  };

  const attach = (el: Element, token: string, action: WebStepAction) => {
    const onAct = (e: Event) => {
      if (!e.isTrusted) return;
      send({ type: 'wt:acted', token });
    };
    const events = ACT_EVENTS[action];
    for (const name of events) el.addEventListener(name, onAct, true);
    detach = () => {
      for (const name of events) el.removeEventListener(name, onAct, true);
    };
    shared.target = { token, el };
  };

  const run = () => {
    timer = null;
    if (!seek) return;
    const current = shared.target;
    if (current && current.token === seek.token) {
      if (current.el.isConnected) return;
      clearTarget();
      send({ type: 'wt:lost', token: seek.token });
    }
    const hit = locate(doc, seek.clues);
    if (!hit) return;
    attach(hit.el, seek.token, seek.action);
    send({
      type: 'wt:found',
      token: seek.token,
      clue: hit.clue,
      tied: hit.tied,
      url: doc.location?.href ?? '',
    });
  };

  const schedule = () => {
    if (timer === null) timer = setTimeout(run, RESEEK_MS);
  };

  const stop = () => {
    seek = null;
    observer?.disconnect();
    observer = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    clearTarget();
  };

  return (cmd) => {
    stop();
    if (cmd.type === 'wt:stop') return;
    seek = cmd;
    const MO = doc.defaultView?.MutationObserver ?? MutationObserver;
    observer = new MO(schedule);
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    run();
  };
}
