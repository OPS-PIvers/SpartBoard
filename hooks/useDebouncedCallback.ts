import { useEffect, useMemo, useRef } from 'react';
import { logError } from '@/utils/logError';

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

  // Keep the ref up to date with the latest fn so the debounced closure always
  // invokes the freshest version. This is the correct escape-hatch pattern
  // from React docs for "always invoke the latest fn": update in a layout
  // effect so the ref is set synchronously before any scheduled timeout fires.
  // We intentionally omit the dependency array (same as `useEffect` with no
  // deps) so it runs after every render.
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
        timeoutRef.current = setTimeout(() => {
          try {
            // Cast to unknown first to avoid unsafe-assignment while still
            // allowing us to check for a returned Promise at runtime.
            const result: unknown = (fnRef.current as (...a: TArgs) => unknown)(
              ...args
            );
            if (result instanceof Promise) {
              result.catch((err: unknown) =>
                logError('useDebouncedCallback', err)
              );
            }
          } catch (err) {
            logError('useDebouncedCallback', err);
          }
        }, delayMs);
      },
    [delayMs]
  );
}
