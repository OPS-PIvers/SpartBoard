import { useCallback, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { claimBoardTrigger } from '@/utils/boardTriggerClaim';

// Resolves true when this device should act on a trigger value for `widgetId`; one device wins per value.
export const useBoardTriggerClaim = (widgetId: string) => {
  const { dashboards } = useDashboard();
  const boardId = useMemo(() => {
    const board = dashboards?.find((d) =>
      d.widgets.some((w) => w.id === widgetId)
    );
    // A view-only copy can't record a claim, so it acts as it always has.
    if (
      !board ||
      (board.linkedShareRole === 'viewer' && !board.linkedShareEnded)
    ) {
      return undefined;
    }
    return board.id;
  }, [dashboards, widgetId]);
  return useCallback(
    (value: number) => claimBoardTrigger(boardId, widgetId, value),
    [boardId, widgetId]
  );
};
