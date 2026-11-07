import { useCallback } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { claimBoardTrigger } from '@/utils/boardTriggerClaim';

// Resolves true when this device should act on a trigger value for `widgetId`; one device showing the board wins per value.
export const useBoardTriggerClaim = (widgetId: string) => {
  const { activeDashboard } = useDashboard();
  const board = activeDashboard?.widgets.some((w) => w.id === widgetId)
    ? activeDashboard
    : undefined;
  // A hidden copy (whose writes don't land) and a view-only copy act without a claim, as they always have, so neither can take the claim from the shown board.
  const boardId =
    board && !(board.linkedShareRole === 'viewer' && !board.linkedShareEnded)
      ? board.id
      : undefined;
  return useCallback(
    (value: number) => claimBoardTrigger(boardId, widgetId, value),
    [boardId, widgetId]
  );
};
