import { useCallback } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';

/** Runs a period write, toasting a failure. */
export function usePeriodRunner(
  logTag: string
): (fn: () => Promise<unknown>) => Promise<void> {
  const { addToast } = useDashboard();
  return useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        logError(logTag, err);
        addToast('Could not update the period. Try again.', 'error');
      }
    },
    [logTag, addToast]
  );
}
