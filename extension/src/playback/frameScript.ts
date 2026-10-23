import { assessTarget, type WebLocatorClues } from './locate';
import type { WebStepAction } from './progress';
import { captureTarget } from '../recorder/captureTarget';
import { toBox } from '../recorder/geometry';

/** Messages the service worker sends to every frame of a playing tab. */
export type FrameCommand =
  | {
      type: 'wt:seek';
      token: string;
      clues: WebLocatorClues;
      action: WebStepAction;
    }
  | { type: 'wt:stop' };

/** Messages a frame reports back. */
export type FrameReport =
  | {
      type: 'wt:found';
      token: string;
      /** Scored close to another element (C2). */
      weak: boolean;
      url: string;
      /** A weak match's own clues, read fresh, as a suggested fix (C14). */
      fix?: WebLocatorClues;
    }
  /** Nothing cleared the floor; the closest identified element's clues, sent when they change. */
  | { type: 'wt:candidate'; token: string; fix: WebLocatorClues }
  /** Candidates tie and none is nearest the recorded box; sent once per seek. */
  | { type: 'wt:ambiguous'; token: string }
  | { type: 'wt:lost'; token: string }
  | { type: 'wt:acted'; token: string };

/** Shared with the overlay script, which runs in the same isolated world. */
export interface FrameTarget {
  token: string;
  el: Element;
}

declare global {
  var __sbWebTourFrame: { target: FrameTarget | null } | undefined;
}

/** An element's clues as the recorder reads them (scrubbed), with its box in this frame's viewport. */
export function cluesOf(el: Element): WebLocatorClues {
  const { locator, rect, viewport } = captureTarget(el);
  const box = toBox(rect, viewport);
  return { ...locator, ...(box ? { box } : {}) };
}

const ACT_EVENTS: Record<WebStepAction, string[]> = {
  observe: [],
  // The recorder captures on pointerdown, and some menus (Google Docs) open on mousedown.
  click: ['pointerdown', 'mousedown', 'click'],
  type: ['change', 'input'],
  select: ['change', 'input'],
};

// Typing counts as done once the learner pauses, so one keystroke doesn't skip ahead.
const INPUT_SETTLE_MS = 1200;

const RESEEK_MS = 250;

// One press fires pointerdown, mousedown and click within this window.
const PRESS_MS = 1000;

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
  let toldAmbiguous = false;
  let toldCandidate = '';

  const clearTarget = () => {
    detach?.();
    detach = null;
    shared.target = null;
  };

  const attach = (el: Element, token: string, action: WebStepAction) => {
    let settle: ReturnType<typeof setTimeout> | null = null;
    let pressedAt = -Infinity;
    const onAct = (e: Event) => {
      if (!e.isTrusted) return;
      if (e instanceof MouseEvent && e.button !== 0) return;
      if (settle) clearTimeout(settle);
      settle = null;
      if (e.type !== 'input') {
        const now = performance.now();
        if (action === 'click' && now - pressedAt < PRESS_MS) return;
        pressedAt = now;
        send({ type: 'wt:acted', token });
        return;
      }
      settle = setTimeout(() => {
        settle = null;
        send({ type: 'wt:acted', token });
      }, INPUT_SETTLE_MS);
    };
    const events = ACT_EVENTS[action];
    for (const name of events) el.addEventListener(name, onAct, true);
    detach = () => {
      if (settle) clearTimeout(settle);
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
    const out = assessTarget(doc, seek.clues);
    if (out.kind === 'ambiguous' && !toldAmbiguous) {
      toldAmbiguous = true;
      send({ type: 'wt:ambiguous', token: seek.token });
    }
    if (out.kind === 'none' && out.candidate) {
      const fix = cluesOf(out.candidate);
      const said = JSON.stringify(fix);
      if (said !== toldCandidate) {
        toldCandidate = said;
        send({ type: 'wt:candidate', token: seek.token, fix });
      }
    }
    if (out.kind !== 'match') return;
    const hit = out.match;
    attach(hit.el, seek.token, seek.action);
    send({
      type: 'wt:found',
      token: seek.token,
      weak: hit.weak,
      url: doc.location?.href ?? '',
      ...(hit.weak ? { fix: cluesOf(hit.el) } : {}),
    });
  };

  const schedule = () => {
    if (timer === null) timer = setTimeout(run, RESEEK_MS);
  };

  const stop = () => {
    seek = null;
    toldAmbiguous = false;
    toldCandidate = '';
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
