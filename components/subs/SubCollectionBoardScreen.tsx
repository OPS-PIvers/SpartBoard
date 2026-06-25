/**
 * SubCollectionBoardScreen — frozen, read-only-but-content-interactive view of
 * a single Board that lives INSIDE a substitute-mode shared Collection.
 *
 * This is the Collection-board sibling of `SubBoardScreen`. The only
 * difference is the data source: a single-board substitute share lives at
 * `/shared_boards/{shareId}`, whereas a Collection board lives at
 * `/shared_collections/{shareId}/boards/{boardId}` (with share-level metadata
 * on the parent `/shared_collections/{shareId}` doc). `useSubstituteCollectionBoard`
 * splices those two reads into the same `SubstituteShareDoc` shape, so once
 * loaded we render the exact same `SubsDashboardProvider` + toolbar + canvas
 * chrome via the shared `SubBoardScreenContent`.
 */

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSubstituteCollectionBoard } from '@/hooks/useSubstituteShares';
import { SubsDashboardProvider } from './SubsDashboardProvider';
import { SubBoardScreenContent, ExpiredOrErrorPanel } from './SubBoardScreen';

interface SubCollectionBoardScreenProps {
  shareId: string;
  boardId: string;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

export const SubCollectionBoardScreen: React.FC<
  SubCollectionBoardScreenProps
> = ({ shareId, boardId, onBackToDirectory, onChangeBuilding }) => {
  const { share, loading, error } = useSubstituteCollectionBoard(
    shareId,
    boardId
  );
  const [expired, setExpired] = useState(false);

  // Mirror SubBoardScreen: imperative 60s tick so an idle sub gets bounced
  // back when the share lapses while a board is open. Date.now() stays inside
  // the effect, never in render.
  const expiresAt = share?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const check = () => {
      if (expiresAt <= Date.now()) setExpired(true);
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!expired) return;
    const id = window.setTimeout(onBackToDirectory, 1500);
    return () => window.clearTimeout(id);
  }, [expired, onBackToDirectory]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/60 bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!!error || !share || expired) {
    return (
      <div className="min-h-screen bg-slate-900">
        <ExpiredOrErrorPanel
          message={
            expired ? 'This share has expired.' : (error ?? 'Board not found.')
          }
          onBack={onBackToDirectory}
        />
      </div>
    );
  }

  return (
    <SubsDashboardProvider share={share}>
      <SubBoardScreenContent
        share={share}
        onBackToDirectory={onBackToDirectory}
        onChangeBuilding={onChangeBuilding}
      />
    </SubsDashboardProvider>
  );
};
