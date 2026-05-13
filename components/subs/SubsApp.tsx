/**
 * SubsApp — top-level routing for the `/subs` substitute teacher portal.
 *
 * 3-step local state machine inside a domain-gated AuthProvider tree:
 *
 *   1. BuildingPickerScreen — pick the building you're subbing in
 *   2. TeacherDirectoryScreen — pick a teacher whose board to open
 *   3. SubBoardScreen — read-only-but-interactive frozen board
 *
 * Data comes from Firestore via useSubstituteShares (Phase 4). The actual
 * widget rendering in SubBoardScreen still uses the hand-rendered tile
 * placeholders from Phase A — full widget rendering with the teacher's
 * config is on the Phase 6 polish list.
 */

import React, { useEffect, useState } from 'react';
import { SubsAuthGate } from './SubsAuthGate';
import { BuildingPickerScreen } from './BuildingPickerScreen';
import { TeacherDirectoryScreen } from './TeacherDirectoryScreen';
import { SubBoardScreen } from './SubBoardScreen';

type SubsView =
  | { kind: 'building-picker' }
  | { kind: 'directory'; buildingId: string }
  | { kind: 'board'; buildingId: string; shareId: string };

const VIEW_STORAGE_KEY = 'spart_subs_view';

export const SubsApp: React.FC = () => {
  const [view, setView] = useState<SubsView>(() => {
    // Restore the last-picked building so a sub bouncing between cards
    // doesn't lose their place if they refresh.
    if (typeof window === 'undefined') return { kind: 'building-picker' };
    try {
      const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (!raw) return { kind: 'building-picker' };
      const parsed = JSON.parse(raw) as SubsView;
      if (
        parsed.kind === 'directory' &&
        typeof (parsed as { buildingId?: unknown }).buildingId === 'string'
      ) {
        return parsed;
      }
    } catch {
      // ignore corrupt localStorage; start fresh
    }
    return { kind: 'building-picker' };
  });

  // Persist just the building selection — not the open board — so a refresh
  // returns to the directory rather than re-opening a possibly-stale share.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (view.kind === 'directory') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
    } else if (view.kind === 'building-picker') {
      window.localStorage.removeItem(VIEW_STORAGE_KEY);
    }
  }, [view]);

  return (
    <SubsAuthGate>
      {view.kind === 'building-picker' && (
        <BuildingPickerScreen
          onPick={(buildingId) => setView({ kind: 'directory', buildingId })}
        />
      )}

      {view.kind === 'directory' && (
        <TeacherDirectoryScreen
          buildingId={view.buildingId}
          onPickBoard={(shareId) =>
            setView({ kind: 'board', buildingId: view.buildingId, shareId })
          }
          onChangeBuilding={() => setView({ kind: 'building-picker' })}
        />
      )}

      {view.kind === 'board' && (
        <SubBoardScreen
          shareId={view.shareId}
          onBackToDirectory={() =>
            setView({ kind: 'directory', buildingId: view.buildingId })
          }
          onChangeBuilding={() => setView({ kind: 'building-picker' })}
        />
      )}
    </SubsAuthGate>
  );
};
