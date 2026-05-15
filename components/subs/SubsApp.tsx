/**
 * SubsApp — top-level routing for the `/subs` substitute teacher portal.
 *
 * 3-step local state machine inside a domain-gated AuthProvider tree:
 *
 *   1. BuildingPickerScreen — pick the building you're subbing in
 *   2. TeacherDirectoryScreen — pick a teacher whose board to open
 *   3. SubBoardScreen — read-only-but-interactive frozen board
 *
 * Data comes from Firestore via useSubstituteShares. SubBoardScreen mounts
 * a SubsDashboardProvider that synthesises a DashboardContextValue from the
 * share's `initialState` snapshot, then renders the teacher's real widgets
 * through the canonical WidgetRenderer pipeline (locked read-only via
 * `isActiveBoardReadOnly: true`).
 *
 * The view state machine lives inside `SubsContent`, mounted only after
 * `SubsAuthGate` has confirmed a signed-in `@orono.k12.mn.us` user. This
 * lets us scope the building-restore localStorage key to the user's UID
 * so two subs sharing a classroom cart don't inherit each other's last
 * building selection.
 */

import React, { useEffect, useState } from 'react';
import { SubsAuthGate } from './SubsAuthGate';
import { BuildingPickerScreen } from './BuildingPickerScreen';
import { TeacherDirectoryScreen } from './TeacherDirectoryScreen';
import { SubBoardScreen } from './SubBoardScreen';
import { useAuth } from '@/context/useAuth';

type SubsView =
  | { kind: 'building-picker' }
  | { kind: 'directory'; buildingId: string }
  | { kind: 'board'; buildingId: string; shareId: string };

// Per-user storage key. SubsAuthGate guarantees `uid` is set before this
// runs (it doesn't render children until auth is settled + allowed), so
// the only way to land in the `anon` fallback is if useAuth somehow
// returns no user at this layer — defensive only.
function storageKeyFor(uid: string | null | undefined): string {
  return `spart_subs_view_${uid ?? 'anon'}`;
}

export const SubsApp: React.FC = () => (
  <SubsAuthGate>
    <SubsContent />
  </SubsAuthGate>
);

const SubsContent: React.FC = () => {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const storageKey = storageKeyFor(uid);

  const [view, setView] = useState<SubsView>(() => {
    // Restore the last-picked building so a sub bouncing between cards
    // doesn't lose their place if they refresh. Per-UID key prevents
    // cross-user leakage on shared classroom hardware.
    if (typeof window === 'undefined') return { kind: 'building-picker' };
    try {
      const raw = window.localStorage.getItem(storageKey);
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
      window.localStorage.setItem(storageKey, JSON.stringify(view));
    } else if (view.kind === 'building-picker') {
      window.localStorage.removeItem(storageKey);
    }
  }, [view, storageKey]);

  return (
    <>
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
    </>
  );
};
