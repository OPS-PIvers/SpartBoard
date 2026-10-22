// Closes the signed-in teacher's walls to a Synced or View-Only board once the board stops showing them.

import { useEffect, useRef } from 'react';
import {
  useActiveBoardLinkedShareId,
  useDashboardCanvasSelector,
} from '@/context/dashboardCanvasStore';
import type { ActivityWallConfig } from '@/types';
import { closeWallsToBoard } from '@/utils/activityWallBoardAccess';

const SETTLE_MS = 3000;

/** Runs `closeWallsToBoard` for the active board whenever the walls it shows change. */
export function useWallBoardAccessCleanup(uid: string | null): void {
  const boardShareId = useActiveBoardLinkedShareId();
  // A sorted id list as a string, so unrelated widget edits don't re-run it.
  const shownWallsKey = useDashboardCanvasSelector((s) =>
    (uid ? (s.activeDashboard?.widgets ?? []) : [])
      .filter((w) => w.type === 'activity-wall')
      .map((w) => (w.config as ActivityWallConfig).activeActivityId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .sort()
      .join('|')
  );

  // A close still waiting when the teacher moves to another board runs at once.
  const pending = useRef<{ shareId: string; run: () => void } | null>(null);

  useEffect(() => {
    const waiting = pending.current;
    if (waiting && waiting.shareId !== boardShareId) waiting.run();
    if (!uid || !boardShareId) return undefined;
    const keep = new Set(shownWallsKey ? shownWallsKey.split('|') : []);
    const run = () => {
      pending.current = null;
      void closeWallsToBoard(uid, boardShareId, keep).catch((err: unknown) => {
        console.error('[ActivityWall] Failed to close walls to board:', err);
      });
    };
    pending.current = { shareId: boardShareId, run };
    const timer = setTimeout(run, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [uid, boardShareId, shownWallsKey]);
}
