import { assessTarget, rootsOf, type WebLocatorClues } from './locate';
import type { WebStepAction } from './progress';
import { captureTarget } from '../recorder/captureTarget';
import { toBox } from '../recorder/geometry';
import { fixKey } from '@/components/tours/web/fixClues';
import { BENCH, benchMark } from '../bench';
import { overlayLoaded } from '../overlay/loaded';
import {
  matchLookahead,
  waitForSettle,
  type SettleWait,
} from '@/components/tours/playbackEngine';
import { domSettleHost } from '@/components/tours/settleDom';

/** One step's search: its target's clues and how the learner finishes it. */
export interface SeekStep {
  token: string;
  clues: WebLocatorClues;
  action: WebStepAction;
  /** The step's place in the tour, so a learner who acts on it early can be caught up (TOURS_10X.md P2). */
  index?: number;
  stepId?: string;
}

/** A later step watched for a learner who got ahead of the tour (P2). */
export interface AheadStep {
  index: number;
  stepId: string;
  clues: WebLocatorClues;
  action: WebStepAction;
}

/** Messages the service worker sends to every frame of a playing tab. */
export type FrameCommand =
  | ({
      type: 'wt:seek';
      /** The step that follows when this one is done here, sought at once so the spotlight needn't wait on the service worker. */
      next?: SeekStep;
      /** Up to three later steps on this page and frame, nearest first. */
      ahead?: AheadStep[];
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
  | { type: 'wt:acted'; token: string }
  /** The learner acted on step `index` before the tour lit it; sent once the page around it settles (P1, P2). */
  | { type: 'wt:ahead'; token: string; index: number; stepId: string };

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
// Watched later steps (P2) are looked for this long after a seek begins, and a missing one again after a growing pause.
const AHEAD_AFTER_SEEK_MS = 200;
const AHEAD_RETRY_MS = 250;
const AHEAD_RETRY_MAX_MS = 4000;
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

const isStepShape = (m: Record<string, unknown>) =>
  typeof m.clues === 'object' &&
  m.clues !== null &&
  typeof m.action === 'string' &&
  m.action in ACT_EVENTS;

const isSeekStep = (m: Record<string, unknown>) =>
  typeof m.token === 'string' &&
  isStepShape(m) &&
  (m.index === undefined || typeof m.index === 'number') &&
  (m.stepId === undefined || typeof m.stepId === 'string');

const isAheadStep = (m: unknown) =>
  !!m &&
  typeof m === 'object' &&
  isStepShape(m as Record<string, unknown>) &&
  typeof (m as Record<string, unknown>).index === 'number' &&
  typeof (m as Record<string, unknown>).stepId === 'string';

// Events that count as acting on a watched step early; typing counts once the value is committed.
const AHEAD_EVENTS: Record<string, WebStepAction[]> = {
  pointerdown: ['click'],
  mousedown: ['click'],
  click: ['click'],
  change: ['type', 'select'],
};

export function isFrameCommand(msg: unknown): msg is FrameCommand {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (m.type === 'wt:stop') return true;
  const next = m.next as Record<string, unknown> | null | undefined;
  return (
    m.type === 'wt:seek' &&
    isSeekStep(m) &&
    (next === undefined ||
      (typeof next === 'object' && next !== null && isSeekStep(next))) &&
    (m.ahead === undefined ||
      (Array.isArray(m.ahead) && m.ahead.every(isAheadStep)))
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
  // Catch-up (P2): the furthest early action in a burst waits for the page to settle before it is reported.
  let aheadHit: { index: number; stepId: string; el: Element } | null = null;
  let aheadWait: SettleWait | null = null;
  let aheadPress: { at: number; el: EventTarget | null } = {
    at: -Infinity,
    el: null,
  };
  let watchingAhead = false;
  // Watched steps' elements, found ahead of time off the press path; keyed by step index.
  let aheadEls = new Map<
    number,
    {
      stepId: string;
      el: Element | null;
      at: number;
      misses: number;
      retryAt: number;
    }
  >();
  let aheadFrom = 0;
  let domVersion = 0;
  let aheadTimer: ReturnType<typeof setTimeout> | null = null;
  let aheadCost = 0;
  let aheadEnd = -Infinity;

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
    // Watched steps are looked for once the new step has had its turn.
    aheadFrom = performance.now() + AHEAD_AFTER_SEEK_MS;
    scheduleAhead();
  };

  /** Reports the step done and moves straight on to seeking the next one, which the service worker confirms with the same token. */
  const acted = (token: string) => {
    benchMark('acted', { token });
    send({ type: 'wt:acted', token });
    const next = seek?.token === token ? seek.next : undefined;
    if (!next) return;
    const ahead = seek?.ahead?.filter(
      (a) => next.index === undefined || a.index > next.index
    );
    clearTarget();
    // After the learner's own event, so the page answers their click before any search runs.
    begin({ type: 'wt:seek', ...next, ...(ahead ? { ahead } : {}) }, true);
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

  /** The next watched step whose element is unknown, gone, or not looked for since the page last changed. */
  const aheadTodo = (): AheadStep | undefined =>
    seek?.ahead?.find((a) => {
      const c = aheadEls.get(a.index);
      if (!c || c.stepId !== a.stepId) return true;
      if (c.el) return !c.el.isConnected;
      // A target not on the page yet is looked for again after the page changes, less often each miss.
      return c.at < domVersion && performance.now() >= c.retryAt;
    });

  /** Resolves one watched step when the frame is idle, never inside an event, at most a fifth of the time (like the main search). */
  const scheduleAhead = () => {
    if (aheadTimer !== null || !watchingAhead || !aheadTodo()) return;
    const wait = Math.max(
      0,
      aheadFrom - performance.now(),
      Math.min(
        RESEEK_MAX_MS,
        aheadEnd + aheadCost * RESEEK_COST_RATIO - performance.now()
      )
    );
    aheadTimer = setTimeout(() => {
      const view = doc.defaultView;
      const go = () => {
        aheadTimer = null;
        resolveAhead();
      };
      if (typeof view?.requestIdleCallback === 'function')
        view.requestIdleCallback(go, { timeout: 500 });
      else go();
    }, wait);
  };

  const resolveAhead = () => {
    // The current step's own search goes first.
    if (timer !== null || frame) {
      scheduleAhead();
      return;
    }
    const step = aheadTodo();
    if (!step) return;
    const began = performance.now();
    const out = assessTarget(doc, step.clues, [...roots]);
    aheadEnd = performance.now();
    aheadCost = aheadEnd - began;
    if (BENCH)
      benchMark('aheadrun', {
        index: step.index,
        ms: aheadCost,
        kind: out.kind,
      });
    const had = aheadEls.get(step.index);
    const misses =
      out.kind === 'match'
        ? 0
        : (had?.stepId === step.stepId ? had.misses : 0) + 1;
    aheadEls.set(step.index, {
      stepId: step.stepId,
      el: out.kind === 'match' ? out.match.el : null,
      at: domVersion,
      misses,
      retryAt:
        aheadEnd + Math.min(AHEAD_RETRY_MAX_MS, AHEAD_RETRY_MS * 2 ** misses),
    });
    scheduleAhead();
  };

  const dropAhead = () => {
    aheadWait?.cancel();
    aheadWait = null;
    aheadHit = null;
  };

  /** Reports the furthest early action once the page around it has settled. */
  const settleAhead = () => {
    if (aheadWait || !aheadHit) return;
    const began = BENCH ? performance.now() : 0;
    const wait = waitForSettle(
      domSettleHost(doc, { near: () => aheadHit?.el ?? null })
    );
    // The one layout read a click-ahead costs, timed for the bench.
    if (BENCH) benchMark('settlestart', { ms: performance.now() - began });
    aheadWait = wait;
    void wait.done.then(() => {
      if (aheadWait !== wait) return;
      aheadWait = null;
      const hit = aheadHit;
      aheadHit = null;
      if (!hit || !seek) return;
      benchMark('ahead', { token: seek.token, index: hit.index });
      send({
        type: 'wt:ahead',
        token: seek.token,
        index: hit.index,
        stepId: hit.stepId,
      });
    });
  };

  /** A trusted action anywhere in the frame: did it land on the current step before it was found, or on a later one? */
  const onAnyAct = (e: Event) => {
    if (!e.isTrusted || !seek) return;
    if (e instanceof MouseEvent && e.button !== 0) return;
    const kinds = AHEAD_EVENTS[e.type];
    if (!kinds) return;
    const path = e.composedPath();
    if (kinds.includes('click')) {
      // One press fires pointerdown, mousedown and click; the first one decides, even when it was the current step's.
      const now = performance.now();
      const el = path[0] ?? null;
      const same = aheadPress.el === el && now - aheadPress.at < PRESS_MS;
      aheadPress = { at: now, el };
      if (same) return;
    }
    const current = shared.target?.token === seek.token ? shared.target : null;
    if (current && path.includes(current.el)) return;
    const watched: AheadStep[] = [
      ...(seek.index !== undefined && seek.stepId !== undefined && !current
        ? [
            {
              index: seek.index,
              stepId: seek.stepId,
              clues: seek.clues,
              action: seek.action,
            },
          ]
        : []),
      ...(seek.ahead ?? []),
    ];
    const found: { el?: Element } = {};
    // No search here: only the elements found ahead of time are compared.
    const k = matchLookahead(
      watched,
      0,
      (step) => {
        if (!kinds.includes(step.action)) return false;
        const c = aheadEls.get(step.index);
        const el = c?.stepId === step.stepId ? c.el : null;
        if (!el?.isConnected || !path.includes(el)) return false;
        found.el = el;
        return true;
      },
      watched.length
    );
    if (k === null || !found.el) return;
    const hit = watched[k];
    if (!aheadHit || hit.index > aheadHit.index)
      aheadHit = { index: hit.index, stepId: hit.stepId, el: found.el };
    // The settle wait reads layout, so it starts after the learner's event, not inside it.
    setTimeout(settleAhead, 0);
  };

  // The bench times the handler, since it runs inside the learner's own press.
  const onPress = BENCH
    ? (e: Event) => {
        const began = performance.now();
        onAnyAct(e);
        if (e.isTrusted)
          benchMark('press', { type: e.type, ms: performance.now() - began });
      }
    : onAnyAct;

  const watchAhead = (on: boolean) => {
    if (on === watchingAhead) return;
    watchingAhead = on;
    for (const name of Object.keys(AHEAD_EVENTS)) {
      if (on) doc.addEventListener(name, onPress, true);
      else doc.removeEventListener(name, onPress, true);
    }
  };

  const schedule = (records: MutationRecord[]) => {
    addedRoots(records);
    domVersion += 1;
    queue();
    scheduleAhead();
  };

  const stop = () => {
    dropAhead();
    watchAhead(false);
    if (aheadTimer !== null) clearTimeout(aheadTimer);
    aheadTimer = null;
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
      seek = { ...seek, next: cmd.next, ahead: cmd.ahead };
      scheduleAhead();
      return;
    }
    // An early action still ahead of the new step keeps waiting to be reported under the new seek.
    const pending =
      cmd.type === 'wt:seek' &&
      aheadHit &&
      cmd.index !== undefined &&
      aheadHit.index >= cmd.index
        ? aheadHit
        : null;
    stop();
    if (cmd.type === 'wt:stop') {
      aheadEls = new Map();
      return;
    }
    const MO = doc.defaultView?.MutationObserver ?? MutationObserver;
    observer = new MO(schedule);
    rescanRoots();
    // Only a worker that says where each step sits can catch a learner up.
    watchAhead(cmd.index !== undefined || !!cmd.ahead?.length);
    begin(cmd);
    if (pending) {
      aheadHit = pending;
      settleAhead();
    }
  };
}
