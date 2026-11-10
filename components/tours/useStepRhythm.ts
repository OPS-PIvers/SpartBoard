import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { rhythmOf, SETTLE_CAP_MS, waitForSettle } from './playbackEngine';
import { domSettleHost } from './settleDom';

export interface RhythmRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `settle` and `tick` keep the finished step's ring; `glide` moves it; `ready` brings in the tip. */
export type RhythmPhase = 'settle' | 'tick' | 'glide' | 'ready';

export interface StepRhythm {
  /** The ring to draw: the finished step's until the tick is over, then the current one's. */
  rect: RhythmRect | null;
  phase: RhythmPhase;
  /** Draw the tick on the ring. */
  tick: boolean;
  /** The tip may show. */
  tipShown: boolean;
  /** The learner finished the current step: wait for the page to settle, tick, then call `then`; `gone` says the control left the page. */
  act: (
    near: () => Element | null,
    then?: () => void,
    gone?: () => boolean
  ) => void;
}

interface Options {
  /** Off: no rhythm at all, the tip and ring follow the step at once. */
  enabled: boolean;
  reducedMotion: boolean;
  /** Changes on every step change. */
  stepKey: string;
  rect: RhythmRect | null;
  /** The step change came from the learner's action and nobody called `act` (web): settle and tick here. */
  actedChange?: boolean;
  /** The element to settle around after an `actedChange`. */
  near?: () => Element | null;
  doc?: Document;
  /** Changes the tour's own UI makes never count against settling. */
  ignore?: (el: Element) => boolean;
  /** Called as each phase starts, for the bench. */
  onPhase?: (phase: RhythmPhase) => void;
  /** The finished step's control left the page (a new page or panel): no ring to hold or tick on. */
  finishedGone?: () => boolean;
}

interface State {
  phase: RhythmPhase;
  held: RhythmRect | null;
}

const sameRect = (a: RhythmRect | null, b: RhythmRect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

const READY: State = { phase: 'ready', held: null };

/** Settle, tick, glide, tip (TOURS_10X.md P1), shared by the Live runner and the web overlay. */
export function useStepRhythm({
  enabled,
  reducedMotion,
  stepKey,
  rect,
  actedChange = false,
  near,
  doc = typeof document === 'undefined' ? undefined : document,
  ignore,
  onPhase,
  finishedGone,
}: Options): StepRhythm {
  const { tickMs, glideMs } = rhythmOf(reducedMotion);
  const hasRect = rect !== null;
  const [state, setState] = useState<State>(READY);
  const [seenKey, setSeenKey] = useState(stepKey);
  // The last ring drawn for the current step; a ring that blinks out for a moment keeps it.
  const [lastRect, setLastRect] = useState<RhythmRect | null>(rect);
  // The glide starts from the finished step's ring.
  const afterTick: State =
    glideMs > 0 ? { phase: 'glide', held: lastRect } : READY;
  const then = useRef<(() => void) | null>(null);
  const nearRef = useRef<() => Element | null>(() => null);
  const live = useRef({ ignore, onPhase, finishedGone });
  const goneRef = useRef<(() => boolean) | null>(null);

  // A new step glides in, or settles and ticks first when the learner's action brought it (web).
  if (seenKey !== stepKey) {
    setSeenKey(stepKey);
    if (!enabled) setState(READY);
    else if (actedChange && state.phase === 'ready')
      setState({ phase: 'settle', held: lastRect });
    else if (state.phase === 'ready' || state.phase === 'glide')
      setState(afterTick);
  } else if (
    enabled &&
    rect &&
    (state.phase === 'ready' || state.phase === 'glide') &&
    !sameRect(rect, lastRect)
  ) {
    setLastRect(rect);
  }

  useLayoutEffect(() => {
    live.current = { ignore, onPhase, finishedGone };
    if (actedChange && near) nearRef.current = near;
  });

  useEffect(() => {
    if (enabled) live.current.onPhase?.(state.phase);
  }, [enabled, state.phase]);

  useEffect(() => {
    if (!enabled) return undefined;
    const finishTick = (gone = false) => {
      const done = then.current;
      then.current = null;
      setState(gone ? { phase: 'glide', held: null } : afterTick);
      // Live advances here; the step change then glides.
      done?.();
    };
    if (state.phase === 'settle') {
      if (!doc) {
        finishTick();
        return undefined;
      }
      // A control that left the page (now, or while the page settles) gets no ring and no tick.
      const goneCheck = goneRef.current ?? live.current.finishedGone;
      goneRef.current = null;
      const isGone = () => goneCheck?.() ?? false;

      if (isGone() && state.held) setState({ phase: 'settle', held: null });
      const wait = waitForSettle(
        domSettleHost(doc, {
          near: () => nearRef.current(),
          ignore: (el) => live.current.ignore?.(el) ?? false,
        })
      );
      void wait.done.then(() => {
        const gone = isGone();
        if (tickMs > 0 && !gone)
          setState((s) => ({ phase: 'tick', held: s.held }));
        else finishTick(gone);
      });
      return () => wait.cancel();
    }
    if (state.phase === 'tick') {
      const id = setTimeout(() => finishTick(), tickMs);
      return () => clearTimeout(id);
    }
    if (state.phase === 'glide') {
      // Glides once the next target is on screen; one that never shows gives up waiting.
      const id = setTimeout(
        () => setState(READY),
        hasRect ? glideMs : SETTLE_CAP_MS
      );
      return () => clearTimeout(id);
    }
    return undefined;
    // afterTick is derived from glideMs, which is a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, doc, state.phase, tickMs, glideMs, hasRect]);

  const act = useCallback(
    (find: () => Element | null, next?: () => void, gone?: () => boolean) => {
      if (!enabled) {
        next?.();
        return;
      }
      then.current = next ?? null;
      nearRef.current = find;
      goneRef.current = gone ?? null;
      setState({ phase: 'settle', held: lastRect });
    },
    [enabled, lastRect]
  );

  const holding = state.phase === 'settle' || state.phase === 'tick';
  const shown = !enabled
    ? rect
    : holding
      ? state.held
      : state.phase === 'glide'
        ? (rect ?? state.held)
        : rect;
  return {
    rect: shown,
    phase: enabled ? state.phase : 'ready',
    tick: enabled && state.phase === 'tick',
    tipShown: !enabled || state.phase === 'ready',
    act,
  };
}
