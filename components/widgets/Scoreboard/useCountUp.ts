import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 350;

let reducedMotionQuery: MediaQueryList | null = null;
const prefersReducedMotion = () => {
  if (!reducedMotionQuery && typeof window.matchMedia === 'function') {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  }
  return !!reducedMotionQuery?.matches;
};

/** Counts the shown number toward `value` over a short ease-out; instant with reduced motion. */
export const useCountUp = (value: number, enabled: boolean): number => {
  const animate = enabled && !prefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    let raf = 0;
    if (!animate || from === value) {
      if (from !== value) {
        raf = requestAnimationFrame(() => {
          displayRef.current = value;
          setDisplay(value);
        });
      }
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / DURATION_MS));
      const eased = 1 - Math.pow(1 - t, 3);
      const next = t < 1 ? Math.round(from + (value - from) * eased) : value;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);

  return animate ? display : value;
};
