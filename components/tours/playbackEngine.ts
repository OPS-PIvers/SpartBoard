// Shared tour playback engine (TOURS_10X.md P1, P2, P6): pure, used by the Live runner and the extension.

/** Steps watched beyond the current one for a learner who got ahead (P2). */
export const LOOKAHEAD_STEPS = 3;
/** A page counts as settled after this long with no layout change near the target. */
export const SETTLE_QUIET_MS = 120;
/** Longest a settle wait lasts, so a page that never rests can't stall the tour. */
export const SETTLE_CAP_MS = 1000;

export interface EngineStep {
  id: string;
}

/** The part of a run the engine moves: where it is and which steps catch-up passed over (P3). */
export interface RunProgress {
  index: number;
  skipped?: readonly string[];
}

/** Indices watched from `current`: the current step and up to `lookahead` after it, within the tour. */
export function lookaheadIndices(
  current: number,
  total: number,
  lookahead = LOOKAHEAD_STEPS
): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, current); i < total && i <= current + lookahead; i++)
    out.push(i);
  return out;
}

/** The nearest watched step the learner's action matched, or null; nearest wins so a repeated control resolves to the earlier step. */
export function matchLookahead<S>(
  steps: readonly S[],
  current: number,
  hit: (step: S, index: number) => boolean,
  lookahead = LOOKAHEAD_STEPS
): number | null {
  for (const i of lookaheadIndices(current, steps.length, lookahead))
    if (hit(steps[i], i)) return i;
  return null;
}

/** The nearest watched step whose action led to `url`: it plays elsewhere and the step after it plays here. */
export function matchPageAhead<S>(
  steps: readonly S[],
  current: number,
  url: string,
  onPage: (step: S, url: string) => boolean,
  leadsAway: (step: S) => boolean = () => true,
  lookahead = LOOKAHEAD_STEPS
): number | null {
  if (!steps[current] || onPage(steps[current], url)) return null;
  return matchLookahead(
    steps,
    current,
    (step, i) =>
      leadsAway(step) &&
      !onPage(step, url) &&
      i + 1 < steps.length &&
      onPage(steps[i + 1], url),
    lookahead
  );
}

/** Ids catch-up passed over in `run`, oldest first. */
const skippedOf = (run: RunProgress): readonly string[] => run.skipped ?? [];

/** Moves past matched step `matched`; the steps between the current one and it are recorded as skipped. */
export function catchUp<R extends RunProgress>(
  run: R,
  steps: readonly EngineStep[],
  matched: number
): R & { skipped: string[] } {
  const passed = steps
    .slice(Math.max(0, run.index), Math.max(0, matched))
    .map((s) => s.id);
  const skipped = [...skippedOf(run)];
  for (const id of passed) if (!skipped.includes(id)) skipped.push(id);
  const done = steps[matched]?.id;
  return {
    ...run,
    index: matched + 1,
    skipped: skipped.filter((id) => id !== done),
  };
}

/** Enters step `index` normally (Next, Back, done); a skipped step that is visited is no longer skipped. */
export function enterRun<R extends RunProgress>(
  run: R,
  steps: readonly EngineStep[],
  index: number
): R {
  const id = steps[index]?.id;
  const had = skippedOf(run);
  if (!id || !had.includes(id)) return { ...run, index };
  return { ...run, index, skipped: had.filter((s) => s !== id) };
}

/** The skipped steps' indices in tour order, for the step bar's hollow dots and Back (P3). */
export function skippedIndices(
  run: RunProgress,
  steps: readonly EngineStep[]
): number[] {
  const skipped = new Set(skippedOf(run));
  return steps.flatMap((s, i) => (skipped.has(s.id) ? [i] : []));
}

/** The nearest skipped step before the current one, where Back returns to (P3); null when there is none. */
export function previousSkipped(
  run: RunProgress,
  steps: readonly EngineStep[]
): number | null {
  const before = skippedIndices(run, steps).filter((i) => i < run.index);
  return before.length > 0 ? before[before.length - 1] : null;
}

export interface SettleOptions {
  quietMs?: number;
  capMs?: number;
}

/** `quiet`: nothing changed for the quiet window; `cap`: the page kept changing until the cap. */
export type SettleReason = 'quiet' | 'cap';

export interface SettleTracker {
  readonly startedAt: number;
  /** A layout change near the target at `now`. */
  change(now: number): void;
  /** Milliseconds until it would count as settled with no further change; 0 once settled. */
  due(now: number): number;
  settled(now: number): SettleReason | null;
}

/** Settle state as plain arithmetic over the times it is told about. */
export function createSettle(
  now: number,
  { quietMs = SETTLE_QUIET_MS, capMs = SETTLE_CAP_MS }: SettleOptions = {}
): SettleTracker {
  let last = now;
  const settled = (at: number): SettleReason | null =>
    at - last >= quietMs ? 'quiet' : at - now >= capMs ? 'cap' : null;
  return {
    startedAt: now,
    change(at) {
      last = Math.max(last, at);
    },
    due(at) {
      if (settled(at)) return 0;
      return Math.max(0, Math.min(last + quietMs, now + capMs) - at);
    },
    settled,
  };
}

/** The clock and the change feed a settle wait runs on; each side supplies its own. */
export interface SettleHost {
  now(): number;
  setTimer(ms: number, cb: () => void): () => void;
  /** Calls `onChange` on every layout change in the watched area; returns the unsubscribe. */
  watch(onChange: () => void): () => void;
}

export interface SettleWait {
  done: Promise<SettleReason>;
  /** Stops waiting; `done` never resolves after this. */
  cancel(): void;
}

/** Resolves once the watched area has been still for the quiet window, or at the cap. */
export function waitForSettle(
  host: SettleHost,
  opts: SettleOptions = {}
): SettleWait {
  const tracker = createSettle(host.now(), opts);
  let stopTimer: (() => void) | null = null;
  let unwatch: (() => void) | null = null;
  let finished = false;
  let resolve: (r: SettleReason) => void = () => undefined;
  const done = new Promise<SettleReason>((r) => {
    resolve = r;
  });
  const end = () => {
    finished = true;
    stopTimer?.();
    stopTimer = null;
    unwatch?.();
    unwatch = null;
  };
  const check = () => {
    if (finished) return;
    const at = host.now();
    const reason = tracker.settled(at);
    if (reason) {
      end();
      resolve(reason);
      return;
    }
    stopTimer?.();
    stopTimer = host.setTimer(Math.max(1, tracker.due(at)), check);
  };
  unwatch = host.watch(() => {
    if (!finished) tracker.change(host.now());
  });
  check();
  return { done, cancel: end };
}
