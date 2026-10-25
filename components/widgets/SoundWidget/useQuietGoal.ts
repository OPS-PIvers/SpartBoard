import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { usePageVisible } from './usePageVisible';

const TICK_MS = 250;

/** Quiet time progress: counts real time while `counting` and the page is visible, and reports the goal once. */
export const useQuietGoal = (
  counting: boolean,
  goalMs: number,
  onReached: () => void
) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedRef = useRef(0);
  // One report per run, even if the goal minutes change after it is reached.
  const reportedRef = useRef(false);
  const reached = useEffectEvent(onReached);
  const visible = usePageVisible();
  const active = counting && visible;
  const done = goalMs > 0 && elapsedMs >= goalMs;

  useEffect(() => {
    if (!active || goalMs <= 0 || done) return undefined;
    let last = Date.now();
    const bank = () => {
      const now = Date.now();
      const next = Math.min(goalMs, elapsedRef.current + (now - last));
      last = now;
      elapsedRef.current = next;
      setElapsedMs(next);
      if (next >= goalMs && !reportedRef.current) {
        reportedRef.current = true;
        reached();
      }
    };
    const timer = setInterval(bank, TICK_MS);
    // Keep the partial tick when counting pauses.
    return () => {
      clearInterval(timer);
      bank();
    };
  }, [active, goalMs, done]);

  const reset = useCallback(() => {
    elapsedRef.current = 0;
    reportedRef.current = false;
    setElapsedMs(0);
  }, []);

  return { elapsedMs: Math.min(elapsedMs, goalMs), done, reset };
};
