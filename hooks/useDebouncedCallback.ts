import { useEffect, useMemo, useRef } from 'react';

/**
 * Returns a stable callback that debounces calls to the latest version of `fn`
 * by `delayMs`. The latest `fn` reference is always invoked when the debounce
 * fires, so closure-captured stale values are avoided.
 *
 * Use for things like slider drags that fire many onChange events per second
 * but should only persist to storage occasionally.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always invoke the freshest fn
  useEffect(() => {
    fnRef.current = fn;
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useMemo(
    () =>
      (...args: TArgs) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => fnRef.current(...args), delayMs);
      },
    [delayMs]
  );
}
