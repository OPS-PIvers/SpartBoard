import { useCallback } from 'react';
import type { PeriodAccess } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';

/** Runs a period write, toasting an untimed start or a failure. */
export function usePeriodRunner(
  periodAccess: Record<string, PeriodAccess> | undefined,
  logTag: string
): (fn: () => Promise<unknown>) => Promise<void> {
  const { addToast } = useDashboard();
  return useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        const untimed = await fn();
        const labels = (Array.isArray(untimed) ? (untimed as string[]) : [])
          .map((key) => periodAccess?.[key]?.label)
          .filter(Boolean);
        if (labels.length > 0)
          addToast(
            `${labels.join(', ')} stays open until you pause it. Tag the class with its bell period in My Classes so it closes at the bell.`,
            'info'
          );
      } catch (err) {
        logError(logTag, err);
        addToast('Could not update the period. Try again.', 'error');
      }
    },
    [periodAccess, logTag, addToast]
  );
}
