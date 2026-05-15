import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Collection, Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { BoardCard } from './BoardCard';
import { CollectionCard } from './CollectionCard';

interface BoardGridProps {
  selectedCollectionId: string | null;
  collections: Collection[];
  boards: Dashboard[];
  selectedIds: ReadonlySet<string>;
  isSelectMode: boolean;
  onSelectCollection: (id: string | null) => void;
  onToggleSelect: (id: string) => void;
  onOpenBoard: (id: string) => void;
  onContextMenu: (
    e: React.MouseEvent,
    target: { type: 'board' | 'collection'; id: string }
  ) => void;
}

export const BoardGrid: React.FC<BoardGridProps> = ({
  selectedCollectionId,
  collections,
  boards,
  selectedIds,
  isSelectMode,
  onSelectCollection,
  onToggleSelect,
  onOpenBoard,
  onContextMenu,
}) => {
  const { t } = useTranslation();
  const { activeDashboard } = useDashboard();

  const subCollections = useMemo(
    () =>
      collections
        .filter((c) => c.parentCollectionId === selectedCollectionId)
        .sort((a, b) => a.order - b.order),
    [collections, selectedCollectionId]
  );

  const boardsHere = useMemo(
    () =>
      boards
        .filter((b) => (b.collectionId ?? null) === selectedCollectionId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [boards, selectedCollectionId]
  );

  const childCounts = useMemo(() => {
    const counts = new Map<string, { folders: number; boards: number }>();
    for (const c of collections) {
      counts.set(c.id, { folders: 0, boards: 0 });
    }
    for (const c of collections) {
      if (c.parentCollectionId) {
        const entry = counts.get(c.parentCollectionId);
        if (entry) entry.folders += 1;
      }
    }
    for (const b of boards) {
      if (b.collectionId) {
        const entry = counts.get(b.collectionId);
        if (entry) entry.boards += 1;
      }
    }
    return counts;
  }, [collections, boards]);

  const isEmpty = subCollections.length === 0 && boardsHere.length === 0;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
          {t('boardsModal.empty', {
            defaultValue:
              'This Collection is empty — drag Boards here or create one.',
          })}
        </div>
      ) : (
        <>
          {subCollections.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xxs font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t('boardsModal.subCollections', {
                  defaultValue: 'Sub-Collections',
                })}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                {subCollections.map((c) => {
                  const counts = childCounts.get(c.id) ?? {
                    folders: 0,
                    boards: 0,
                  };
                  return (
                    <CollectionCard
                      key={c.id}
                      collection={c}
                      childCollectionsCount={counts.folders}
                      childBoardsCount={counts.boards}
                      isSelected={selectedIds.has(c.id)}
                      isSelectMode={isSelectMode}
                      onClick={() => onSelectCollection(c.id)}
                      onLongPress={() => onToggleSelect(c.id)}
                      onContextMenu={(e) =>
                        onContextMenu(e, { type: 'collection', id: c.id })
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}

          {boardsHere.length > 0 && (
            <div>
              <h3 className="text-xxs font-bold text-slate-500 uppercase tracking-widest mb-3">
                {t('boardsModal.boards', { defaultValue: 'Boards' })}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {boardsHere.map((b) => (
                  <BoardCard
                    key={b.id}
                    board={b}
                    isActive={activeDashboard?.id === b.id}
                    isSelected={selectedIds.has(b.id)}
                    isSelectMode={isSelectMode}
                    onClick={() => onOpenBoard(b.id)}
                    onLongPress={() => onToggleSelect(b.id)}
                    onContextMenu={(e) =>
                      onContextMenu(e, { type: 'board', id: b.id })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
