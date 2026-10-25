import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';

const TICK_MS = 250;

/** Quiet time progress: counts while `counting`, stops at the goal and reports it once. */
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
  const done = goalMs > 0 && elapsedMs >= goalMs;

  useEffect(() => {
    if (!counting || goalMs <= 0 || done) return undefined;
    const timer = setInterval(() => {
      const next = Math.min(goalMs, elapsedRef.current + TICK_MS);
      elapsedRef.current = next;
      setElapsedMs(next);
      if (next >= goalMs && !reportedRef.current) {
        reportedRef.current = true;
        reached();
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [counting, goalMs, done]);

  const reset = useCallback(() => {
    elapsedRef.current = 0;
    reportedRef.current = false;
    setElapsedMs(0);
  }, []);

  return { elapsedMs: Math.min(elapsedMs, goalMs), done, reset };
};
