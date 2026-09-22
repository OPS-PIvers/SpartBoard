/**
 * SubShareLinkScreen — what a `/subs/s/{shareId}[/{boardId}]` link opens.
 *
 * Reads the share to learn its building and which board to land on, then
 * renders the same board screens the directory does. It keeps that resolved
 * target itself rather than handing it up to `SubsApp`, so there is no effect
 * chaining one piece of state onto another.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useSubShareTarget } from './useSubShareTarget';
import { SubBoardScreen, ExpiredOrErrorPanel } from './SubBoardScreen';
import { SubCollectionBoardScreen } from './SubCollectionBoardScreen';

interface SubShareLinkScreenProps {
  shareId: string;
  boardId?: string;
  /** Leaving the board goes to the share's own building, not the last-picked one. */
  onExitToDirectory: (buildingId: string) => void;
  onChangeBuilding: () => void;
}

export const SubShareLinkScreen: React.FC<SubShareLinkScreenProps> = ({
  shareId,
  boardId,
  onExitToDirectory,
  onChangeBuilding,
}) => {
  const target = useSubShareTarget({
    shareId,
    ...(boardId !== undefined && { boardId }),
  });

  if (target.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/60 bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (target.status === 'error') {
    return (
      <div className="min-h-screen bg-slate-900">
        <ExpiredOrErrorPanel
          message={target.message}
          hint="Pick your building to see what else is shared with subs today."
          actionLabel="Pick a building"
          onBack={onChangeBuilding}
        />
      </div>
    );
  }

  if (target.status === 'board') {
    return (
      <SubBoardScreen
        shareId={target.shareId}
        buildingId={target.buildingId}
        onBackToDirectory={() => onExitToDirectory(target.buildingId)}
        onChangeBuilding={onChangeBuilding}
      />
    );
  }

  return (
    <SubCollectionBoardScreen
      shareId={target.shareId}
      boardId={target.boardId}
      buildingId={target.buildingId}
      onBackToDirectory={() => onExitToDirectory(target.buildingId)}
      onChangeBuilding={onChangeBuilding}
    />
  );
};
