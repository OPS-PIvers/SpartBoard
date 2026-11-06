import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { TAB_EXITS_MAX, type TabExit, type TabExitOutcome } from '@/types';
import { useFocusLossPoll } from '@/hooks/useFocusLossPoll';
import {
  enterFullscreen,
  fullscreenSupported,
  isFullscreenNow,
} from '@/hooks/usePageProtections';
import { logError } from '@/utils/logError';
import {
  isHandedOff,
  markHandedOff,
  subscribeHandOff,
} from '@/utils/attemptHandOff';

/** The exit the overlay shows: live while `outcome` is null, frozen once it closes. */
export interface TabAwayState {
  /** performance.now() when the student left. */
  leftAtPerf: number;
  durationMs: number | null;
  outcome: TabExitOutcome | null;
}

export interface UseTabAwayTrackerArgs {
  /** Listen for new exits: warnings on, attempt in progress, session active. */
  enabled: boolean;
  /** False once the session is paused or ended; an open exit closes as session-ended. */
  sessionActive: boolean;
  /** The response has loaded, so `serverExits` can be trusted for the reopen check. */
  ready: boolean;
  serverExits: TabExit[] | undefined;
  /** Completed attempts, stamped on each exit. */
  attempt: number;
  getPosition: () => Pick<TabExit, 'questionIndex' | 'videoTime'>;
  /** Counts the warning; resolves true when this exit ends the attempt. */
  onLeave: () => Promise<boolean>;
  saveExits: ((exits: TabExit[]) => Promise<void>) | undefined;
  /** Away limit in ms, or null for none. */
  limitMs: number | null;
  /** Submit when the limit passes; otherwise the exit is logged over-limit. */
  autoSubmit: boolean;
  onAwayTooLong: () => void;
  /** The page requires fullscreen: leaving it counts as an exit, which stays open until fullscreen is back. */
  fullscreenRequired?: boolean;
}

interface OpenExit {
  leftAt: number;
  leftAtPerf: number;
}

const outcomeFor = (ms: number, limitMs: number | null): TabExitOutcome =>
  limitMs !== null && ms > limitMs ? 'over-limit' : 'returned';

/**
 * Detects a student leaving a quiz or video activity, logs each exit to
 * `tabExits`, closes it when they come back, and enforces the away limit.
 */
export function useTabAwayTracker(args: UseTabAwayTrackerArgs) {
  const argsRef = useRef(args);
  // eslint-disable-next-line react-hooks/refs
  argsRef.current = args;

  // Set while a warning is up, so a second exit isn't counted on top of it.
  const guardRef = useRef(false);
  const lastLeaveRef = useRef(0);
  const didInitialCheckRef = useRef(false);
  const reopenCheckedRef = useRef(false);
  const openRef = useRef<OpenExit | null>(null);
  // The log as this client last wrote it; the snapshot can lag behind.
  const localExitsRef = useRef<TabExit[] | null>(null);
  // Set once the student has been in fullscreen, so the first Start cover isn't an exit.
  const seenFullscreenRef = useRef(false);
  const [away, setAway] = useState<TabAwayState | null>(null);
  // Once the attempt moved to another tab, this copy stops watching.
  const handedOff = useSyncExternalStore(
    subscribeHandOff,
    isHandedOff,
    () => false
  );
  const enabled = args.enabled && !handedOff;

  const watchesFullscreen = useCallback(
    () => argsRef.current.fullscreenRequired === true && fullscreenSupported(),
    []
  );
  const fullscreenOk = useCallback(
    () =>
      !watchesFullscreen() || !seenFullscreenRef.current || isFullscreenNow(),
    [watchesFullscreen]
  );

  const currentExits = useCallback((): TabExit[] => {
    const server = argsRef.current.serverExits ?? [];
    const local = localExitsRef.current;
    return local && local.length >= server.length ? local : server;
  }, []);

  const persist = useCallback((next: TabExit[]) => {
    localExitsRef.current = next;
    const save = argsRef.current.saveExits;
    if (!save) return;
    save(next).catch((err: unknown) => {
      localExitsRef.current = null;
      logError('useTabAwayTracker.saveExits', err);
    });
  }, []);

  const closeOpen = useCallback(
    (outcome: TabExitOutcome, durationMs: number) => {
      const open = openRef.current;
      if (!open) return;
      openRef.current = null;
      setAway({ leftAtPerf: open.leftAtPerf, durationMs, outcome });
      const exits = currentExits();
      const last = exits[exits.length - 1];
      // Past the cap the exit was never logged.
      if (!last || last.outcome || last.leftAt !== open.leftAt) return;
      const back = outcome === 'returned' || outcome === 'over-limit';
      persist([
        ...exits.slice(0, -1),
        {
          ...last,
          ...(back ? { returnedAt: Date.now() } : {}),
          durationMs: Math.round(durationMs),
          outcome,
        },
      ]);
    },
    [currentExits, persist]
  );

  const handleLeave = useCallback(async () => {
    const a = argsRef.current;
    if (!a.enabled || isHandedOff() || guardRef.current || openRef.current)
      return;
    const now = Date.now();
    // Debounce the blur + visibilitychange pair one exit fires.
    if (now - lastLeaveRef.current < 1000) return;
    if (
      document.visibilityState !== 'hidden' &&
      document.hasFocus() &&
      fullscreenOk()
    )
      return;
    lastLeaveRef.current = now;
    guardRef.current = true;

    const open: OpenExit = { leftAt: now, leftAtPerf: performance.now() };
    openRef.current = open;
    setAway({ leftAtPerf: open.leftAtPerf, durationMs: null, outcome: null });
    const exits = currentExits();
    if (exits.length < TAB_EXITS_MAX) {
      persist([
        ...exits,
        { leftAt: now, attempt: a.attempt, ...a.getPosition() },
      ]);
    }

    let ends = false;
    try {
      ends = await a.onLeave();
    } catch (err) {
      logError('useTabAwayTracker.onLeave', err);
    }
    if (ends && openRef.current === open) {
      closeOpen('auto-submitted', performance.now() - open.leftAtPerf);
    }
  }, [closeOpen, currentExits, fullscreenOk, persist]);

  useEffect(() => {
    if (!enabled) return;
    const onEvent = () => void handleLeave();
    document.addEventListener('visibilitychange', onEvent);
    window.addEventListener('blur', onEvent);
    if (!didInitialCheckRef.current) {
      didInitialCheckRef.current = true;
      // Only a strong background signal counts on mount.
      if (document.visibilityState === 'hidden') onEvent();
    }
    return () => {
      document.removeEventListener('visibilitychange', onEvent);
      window.removeEventListener('blur', onEvent);
    };
  }, [enabled, handleLeave]);

  // Leaving required fullscreen (Esc, or a tab switch out of it) is an exit too.
  const watchFullscreen = enabled && args.fullscreenRequired === true;
  useEffect(() => {
    if (!watchFullscreen || !fullscreenSupported()) return;
    const onChange = () => {
      if (isFullscreenNow()) seenFullscreenRef.current = true;
      else if (seenFullscreenRef.current) void handleLeave();
    };
    // A new attempt starts on the Start cover again.
    seenFullscreenRef.current = isFullscreenNow();
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [watchFullscreen, handleLeave, args.attempt]);

  // Chrome fires no window blur for the URL bar or browser menus.
  useFocusLossPoll({
    enabled,
    onFocusLoss: () => void handleLeave(),
  });

  // While away: watch for the return, the deadline and the session stopping.
  const awayOpen = away !== null && away.outcome === null;
  useEffect(() => {
    if (!awayOpen) return;
    // Chrome can deliver the fullscreen exit after the tab is visible again, so a fullscreen page confirms the return a frame later.
    let confirming = false;
    let frame = 0;
    const check = (fromFrame: boolean) => {
      const open = openRef.current;
      if (!open) return;
      const a = argsRef.current;
      // Another tab of this attempt closed the exit (Schoology's pop out): hand off instead of timing out.
      const closedElsewhere = (a.serverExits ?? []).some(
        (e) => e.leftAt === open.leftAt && e.outcome != null
      );
      if (closedElsewhere || isHandedOff()) {
        openRef.current = null;
        guardRef.current = false;
        setAway(null);
        markHandedOff();
        return;
      }
      const ms = performance.now() - open.leftAtPerf;
      if (a.limitMs !== null && a.autoSubmit && ms >= a.limitMs) {
        closeOpen('auto-submitted', a.limitMs);
        a.onAwayTooLong();
      } else if (!a.sessionActive) {
        closeOpen('session-ended', ms);
      } else if (
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        fullscreenOk()
      ) {
        if (!watchesFullscreen() || fromFrame) {
          closeOpen(outcomeFor(ms, a.limitMs), ms);
        } else if (!confirming) {
          confirming = true;
          frame = requestAnimationFrame(() =>
            window.setTimeout(() => {
              confirming = false;
              check(true);
            }, 0)
          );
        }
      }
    };
    const tick = () => check(false);
    const id = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    document.addEventListener('fullscreenchange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', tick);
      document.removeEventListener('fullscreenchange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [awayOpen, closeOpen, fullscreenOk, watchesFullscreen]);

  // Reopen check: an exit left open by a closed tab or a sleeping device.
  useEffect(() => {
    if (!args.ready || !enabled || reopenCheckedRef.current) return;
    reopenCheckedRef.current = true;
    const a = argsRef.current;
    const exits = a.serverExits ?? [];
    const last = exits[exits.length - 1];
    if (!last || last.outcome || openRef.current) return;
    const now = Date.now();
    const ms = Math.max(0, now - last.leftAt);
    const timedOut =
      a.limitMs !== null &&
      a.autoSubmit &&
      ms >= a.limitMs &&
      last.attempt === a.attempt;
    persist([
      ...exits.slice(0, -1),
      timedOut
        ? { ...last, durationMs: a.limitMs ?? ms, outcome: 'auto-submitted' }
        : {
            ...last,
            returnedAt: now,
            durationMs: ms,
            outcome: outcomeFor(ms, a.limitMs),
          },
    ]);
    if (timedOut) a.onAwayTooLong();
  }, [args.ready, enabled, persist]);

  /** Re-arms detection once the warning is dismissed or the submit settles. */
  const release = useCallback(() => {
    guardRef.current = false;
  }, []);

  /** The warning's dismiss button: re-arms detection and reopens fullscreen when the page requires it. */
  const resume = useCallback(() => {
    guardRef.current = false;
    if (watchesFullscreen() && !isFullscreenNow()) void enterFullscreen();
  }, [watchesFullscreen]);

  return { away, release, resume, handedOff };
}
