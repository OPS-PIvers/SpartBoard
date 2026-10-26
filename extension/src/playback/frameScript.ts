import { assessTarget, rootsOf, type WebLocatorClues } from './locate';
import type { WebStepAction } from './progress';
import { captureTarget } from '../recorder/captureTarget';
import { toBox } from '../recorder/geometry';
import { fixKey } from '@/components/tours/web/fixClues';
import { BENCH, benchMark } from '../bench';
import { overlayLoaded } from '../overlay/loaded';

/** One step's search: its target's clues and how the learner finishes it. */
export interface SeekStep {
  token: string;
  clues: WebLocatorClues;
  action: WebStepAction;
}

/** Messages the service worker sends to every frame of a playing tab. */
export type FrameCommand =
  | ({
      type: 'wt:seek';
      /** The step that follows when this one is done here, sought at once so the spotlight needn't wait on the service worker. */
      next?: SeekStep;
    } & SeekStep)
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
      /** This document already runs the overlay, so it needn't be injected again to light the target. */
      overlay?: boolean;
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
  var __sbWebTourFrame:
    | {
        target: FrameTarget | null;
        /** The overlay's hook, called as soon as a target is attached so it is drawn in the same frame. */
        onTarget?: () => void;
      }
    | undefined;
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

// A search after a page change waits this many times its last run's cost, so it never takes more than a fifth of the page's time.
const RESEEK_COST_RATIO = 4;
const RESEEK_MAX_MS = 1000;
// Searches run just before the next frame paints; this backs that up in a tab that isn't painting.
const RESEEK_FALLBACK_MS = 100;
// Shadow roots a page attaches without changing its own tree (a late component upgrade) are picked up by a full rescan this often.
const ROOTS_RESCAN_MS = 1000;

const OBSERVE: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
};

// One press fires pointerdown, mousedown and click within this window.
const PRESS_MS = 1000;

const isSeekStep = (m: Record<string, unknown>) =>
  typeof m.token === 'string' &&
  typeof m.clues === 'object' &&
  m.clues !== null &&
  typeof m.action === 'string' &&
  m.action in ACT_EVENTS;

export function isFrameCommand(msg: unknown): msg is FrameCommand {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (m.type === 'wt:stop') return true;
  const next = m.next as Record<string, unknown> | null | undefined;
  return (
    m.type === 'wt:seek' &&
    isSeekStep(m) &&
    (next === undefined ||
      (typeof next === 'object' && next !== null && isSeekStep(next)))
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
  let frame = 0;
  let detach: (() => void) | null = null;
  let toldAmbiguous = false;
  let toldCandidate = '';
  // Every open shadow root is searched and watched; kept up to date from mutation records instead of a full walk per search.
  let roots = new Set<Document | ShadowRoot>();
  let rootsAt = 0;
  let lastCost = 0;
  let lastEnd = -Infinity;

  const watchRoot = (root: Document | ShadowRoot) => {
    if (roots.has(root)) return;
    roots.add(root);
    observer?.observe(root, OBSERVE);
  };

  const rescanRoots = () => {
    rootsAt = performance.now();
    for (const root of rootsOf(doc)) watchRoot(root);
  };

  const addedRoots = (records: MutationRecord[]) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.shadowRoot) watchRoot(node.shadowRoot);
        for (const el of node.querySelectorAll('*'))
          if (el.shadowRoot) watchRoot(el.shadowRoot);
      }
    }
  };

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
        acted(token);
        return;
      }
      settle = setTimeout(() => {
        settle = null;
        acted(token);
      }, INPUT_SETTLE_MS);
    };
    const events = ACT_EVENTS[action];
    for (const name of events) el.addEventListener(name, onAct, true);
    detach = () => {
      if (settle) clearTimeout(settle);
      for (const name of events) el.removeEventListener(name, onAct, true);
    };
    shared.target = { token, el };
    shared.onTarget?.();
  };

  const begin = (
    step: Extract<FrameCommand, { type: 'wt:seek' }>,
    later = false
  ) => {
    seek = step;
    toldAmbiguous = false;
    toldCandidate = '';
    benchMark('seek', { token: step.token });
    if (later) queue();
    else run();
  };

  /** Reports the step done and moves straight on to seeking the next one, which the service worker confirms with the same token. */
  const acted = (token: string) => {
    benchMark('acted', { token });
    send({ type: 'wt:acted', token });
    const next = seek?.token === token ? seek.next : undefined;
    if (!next) return;
    clearTarget();
    // After the learner's own event, so the page answers their click before any search runs.
    begin({ type: 'wt:seek', ...next }, true);
  };

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (frame) doc.defaultView?.cancelAnimationFrame(frame);
    frame = 0;
  };

  /** Searches before the next paint (or soon, in a tab that isn't painting), once its cooldown since the last search has passed. */
  const queue = () => {
    if (timer !== null || frame) return;
    const wait = Math.min(
      RESEEK_MAX_MS,
      lastEnd + lastCost * RESEEK_COST_RATIO - performance.now()
    );
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = null;
        queue();
      }, wait);
      return;
    }
    const go = () => {
      cancel();
      run();
    };
    frame = doc.defaultView?.requestAnimationFrame(go) ?? 0;
    timer = setTimeout(go, RESEEK_FALLBACK_MS);
  };

  const run = () => {
    if (!seek) return;
    const current = shared.target;
    if (current && current.token === seek.token) {
      if (current.el.isConnected) return;
      clearTarget();
      send({ type: 'wt:lost', token: seek.token });
    }
    const began = performance.now();
    for (const r of roots)
      if (r instanceof ShadowRoot && !r.host.isConnected) roots.delete(r);
    const out = assessTarget(doc, seek.clues, [...roots]);
    lastEnd = performance.now();
    lastCost = lastEnd - began;
    if (out.kind !== 'match' && lastEnd - rootsAt > ROOTS_RESCAN_MS)
      rescanRoots();
    if (BENCH)
      benchMark('run', { token: seek.token, ms: lastCost, kind: out.kind });
    if (out.kind === 'ambiguous' && !toldAmbiguous) {
      toldAmbiguous = true;
      send({ type: 'wt:ambiguous', token: seek.token });
    }
    if (out.kind === 'none' && out.candidate) {
      const fix = cluesOf(out.candidate);
      // A new position alone isn't a new candidate.
      const said = fixKey(fix);
      if (said !== toldCandidate) {
        toldCandidate = said;
        send({ type: 'wt:candidate', token: seek.token, fix });
      }
    }
    if (out.kind !== 'match') return;
    const hit = out.match;
    benchMark('match', { token: seek.token });
    attach(hit.el, seek.token, seek.action);
    send({
      type: 'wt:found',
      token: seek.token,
      overlay: overlayLoaded(),
      weak: hit.weak,
      url: doc.location?.href ?? '',
      ...(hit.weak ? { fix: cluesOf(hit.el) } : {}),
    });
  };

  const schedule = (records: MutationRecord[]) => {
    addedRoots(records);
    queue();
  };

  const stop = () => {
    seek = null;
    toldAmbiguous = false;
    toldCandidate = '';
    observer?.disconnect();
    observer = null;
    roots = new Set();
    cancel();
    clearTarget();
  };

  return (cmd) => {
    // The step this frame already moved on to by itself: keep what it found.
    if (cmd.type === 'wt:seek' && seek && cmd.token === seek.token) {
      seek = { ...seek, next: cmd.next };
      return;
    }
    stop();
    if (cmd.type === 'wt:stop') return;
    const MO = doc.defaultView?.MutationObserver ?? MutationObserver;
    observer = new MO(schedule);
    rescanRoots();
    begin(cmd);
  };
}
