/**
 * SubsApp — top-level routing for the `/subs` substitute teacher flow.
 *
 * Phase A: mockup-only. No Firestore reads, no auth provider, no domain
 * gating yet. The flow is a 3-step local state machine:
 *
 *   1. BuildingPickerScreen — pick the building you're subbing in
 *   2. TeacherDirectoryScreen — pick a teacher whose board to open
 *   3. SubBoardScreen — read-only-but-interactive frozen board
 *
 * Phase 4 will replace the local state with real Firestore-backed data and
 * a domain-gated AuthProvider wrapper at the route layer in App.tsx.
 */

import React, { useEffect, useState } from 'react';
import { BuildingPickerScreen } from './BuildingPickerScreen';
import { TeacherDirectoryScreen } from './TeacherDirectoryScreen';
import { SubBoardScreen } from './SubBoardScreen';
import { MOCK_BUILDINGS, MOCK_SHARED_BOARDS } from './subsMockData';

type SubsView =
  | { kind: 'building-picker' }
  | { kind: 'directory'; buildingId: string }
  | { kind: 'board'; buildingId: string; shareId: string };

export const SubsApp: React.FC = () => {
  const [view, setView] = useState<SubsView>({ kind: 'building-picker' });

  if (view.kind === 'building-picker') {
    return (
      <BuildingPickerScreen
        buildings={MOCK_BUILDINGS}
        onPick={(buildingId) => setView({ kind: 'directory', buildingId })}
      />
    );
  }

  if (view.kind === 'directory') {
    const building = MOCK_BUILDINGS.find((b) => b.id === view.buildingId);
    const boards = MOCK_SHARED_BOARDS.filter(
      (b) => b.buildingId === view.buildingId
    );
    return (
      <TeacherDirectoryScreen
        building={building}
        boards={boards}
        onPickBoard={(shareId) =>
          setView({ kind: 'board', buildingId: view.buildingId, shareId })
        }
        onChangeBuilding={() => setView({ kind: 'building-picker' })}
      />
    );
  }

  // view.kind === 'board'
  const board = MOCK_SHARED_BOARDS.find((b) => b.shareId === view.shareId);
  if (!board) {
    // Shouldn't happen in the mockup — synchronize back to the directory
    // via effect so we don't setState during render.
    return (
      <SubsAppMissingBoardFallback
        onFallback={() =>
          setView({ kind: 'directory', buildingId: view.buildingId })
        }
      />
    );
  }
  return (
    <SubBoardScreen
      board={board}
      onBackToDirectory={() =>
        setView({ kind: 'directory', buildingId: view.buildingId })
      }
      onChangeBuilding={() => setView({ kind: 'building-picker' })}
    />
  );
};

const SubsAppMissingBoardFallback: React.FC<{ onFallback: () => void }> = ({
  onFallback,
}) => {
  useEffect(() => {
    onFallback();
  }, [onFallback]);
  return null;
};
