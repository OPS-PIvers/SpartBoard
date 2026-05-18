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
  // Keep a ref that always holds the latest `fn` so the debounced closure
  // invokes the freshest version. Per the project styleguide, refs that
  // mirror a value should be assigned in the render body rather than via
  // `useEffect`. The `react-hooks/refs` rule's strict reading flags this
  // pattern; we disable it locally because timer callbacks always defer to
  // the next event loop tick, so the assignment is guaranteed to land
  // before any debounced fn invocation.
  const fnRef = useRef<typeof fn | null>(null);
  // eslint-disable-next-line react-hooks/refs
  fnRef.current = fn;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          const current = fnRef.current;
          if (!current) return;
          try {
            // Cast to unknown first to avoid unsafe-assignment while still
            // allowing us to check for a returned Promise at runtime.
            const result: unknown = (current as (...a: TArgs) => unknown)(
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
