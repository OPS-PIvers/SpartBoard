import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  GuidedLearningSet,
  WebTourCheckResult,
  WebTourLocator,
} from '@/types';
import { startWebTour, watchWebTourCheck } from './extensionClient';
import { buildHandoff, hubStepsOf, startUrlOf } from './webTourHub';
import { targetsSignature } from './webStepReview';

/** Reconnects in a row that may fail before the editor gives up on a check run. */
export const CHECK_RECONNECTS = 5;
export const CHECK_RECONNECT_MS = 2000;
// Only ever read from port callbacks, never during render.
const clock = () => Date.now();

export interface WebTourCheckHandlers {
  /** A run began playing these targets. */
  onStart: (sig: string) => void;
  onResult: (sig: string, stepId: string, result: WebTourCheckResult) => void;
  /** A better candidate's clues for a step this run missed or found weakly (C14). */
  onSuggest?: (sig: string, stepId: string, locator: WebTourLocator) => void;
  onStatus: (message: string) => void;
}

/** Plays a draft in check mode (C12) and hands back only this run's results, reconnecting while the extension's worker restarts. */
export function useWebTourCheck(handlers: WebTourCheckHandlers) {
  const [checking, setChecking] = useState(false);
  const latest = useRef(handlers);
  const stop = useRef<(() => void) | null>(null);
  const timer = useRef<number | null>(null);
  // The run whose results count; any other run's messages are dropped.
  const runRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    latest.current = handlers;
  });

  const halt = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    stop.current?.();
    stop.current = null;
    runRef.current = null;
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      stop.current?.();
      stop.current = null;
      runRef.current = null;
    },
    []
  );

  const end = (message: string) => {
    halt();
    setChecking(false);
    latest.current.onStatus(message);
  };

  const watch = (setId: string, sig: string, runId: string, left: number) => {
    const openedAt = clock();
    let budget = left;
    stop.current = watchWebTourCheck(
      setId,
      (event) => {
        if (event.runId !== runId || runRef.current !== runId) return;
        // A port that delivers counts as a working reconnect.
        budget = CHECK_RECONNECTS;
        if (event.type === 'web-tour/check-step') {
          latest.current.onResult(sig, event.stepId, event.result);
          return;
        }
        if (event.type === 'web-tour/suggest') {
          latest.current.onSuggest?.(sig, event.stepId, event.locator);
          return;
        }
        end(event.done ? 'Check finished.' : 'Check stopped.');
      },
      () => {
        stop.current = null;
        if (runRef.current !== runId) return;
        if (clock() - openedAt >= CHECK_RECONNECT_MS) budget = CHECK_RECONNECTS;
        if (budget <= 0) {
          end('Lost touch with the extension. Check the tour again.');
          return;
        }
        timer.current = window.setTimeout(() => {
          timer.current = null;
          if (runRef.current === runId) watch(setId, sig, runId, budget - 1);
        }, CHECK_RECONNECT_MS);
      }
    );
  };

  const start = async (set: GuidedLearningSet) => {
    const hub = hubStepsOf(set.steps);
    const url = startUrlOf(hub);
    if (hub.length === 0 || !url) {
      latest.current.onStatus(
        "The first step's page can't be opened, so the tour can't be checked."
      );
      return;
    }
    halt();
    const sig = targetsSignature(set);
    const runId = crypto.randomUUID();
    runRef.current = runId;
    latest.current.onStart(sig);
    // Watching first, so the first step's result is never missed.
    watch(set.id, sig, runId, CHECK_RECONNECTS);
    setChecking(true);
    latest.current.onStatus('');
    const handoff = buildHandoff(
      set.id,
      set.updatedAt,
      set.title,
      hub,
      new Map(),
      true
    );
    const result = await startWebTour(handoff, url, 0, runId);
    if (!result.ok && runRef.current === runId)
      end("The check couldn't start.");
  };

  return { checking, start };
}
