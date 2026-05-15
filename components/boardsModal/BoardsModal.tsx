import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCollections } from '@/hooks/useCollections';
import { CollectionTree } from './CollectionTree';
import { BoardGrid } from './BoardGrid';
import { BoardsModalHeader } from './BoardsModalHeader';
import { useMultiSelect } from './useMultiSelect';

interface BoardsModalProps {
  onClose: () => void;
}

export const BoardsModal: React.FC<BoardsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { showPrompt, showConfirm } = useDialog();
  const { user } = useAuth();
  const {
    dashboards,
    activeDashboard,
    loadDashboard,
    createNewDashboard,
    deleteDashboard,
    moveBoardToCollection,
    pinBoard,
    unpinBoard,
  } = useDashboard();
  const { collections, createCollection, deleteCollection } = useCollections(
    user?.uid
  );

  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(activeDashboard?.collectionId ?? null);
  const [search, setSearch] = useState('');
  const multi = useMultiSelect();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (multi.isSelectMode) multi.clearSelection();
        else onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, multi]);

  const handleCreateBoard = useCallback(async () => {
    const name = await showPrompt(
      t('boardsModal.newBoardPrompt', { defaultValue: 'Board name' }),
      {
        title: t('boardsModal.newBoard', { defaultValue: 'New Board' }),
        placeholder: 'Untitled',
        confirmLabel: t('common.create', { defaultValue: 'Create' }),
      }
    );
    if (!name?.trim()) return;
    await createNewDashboard(name.trim());
    // Find the just-created Board (it'll be the most-recent one by createdAt).
    const newest = [...dashboards].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest && selectedCollectionId !== null) {
      await moveBoardToCollection(newest.id, selectedCollectionId);
    }
  }, [
    showPrompt,
    t,
    createNewDashboard,
    dashboards,
    selectedCollectionId,
    moveBoardToCollection,
  ]);

  const handleCreateCollection = useCallback(async () => {
    const name = await showPrompt(
      t('boardsModal.newCollectionPrompt', { defaultValue: 'Collection name' }),
      {
        title: t('boardsModal.newCollection', {
          defaultValue: 'New Collection',
        }),
        placeholder: 'Untitled',
        confirmLabel: t('common.create', { defaultValue: 'Create' }),
      }
    );
    if (!name?.trim()) return;
    await createCollection(name.trim(), selectedCollectionId);
  }, [showPrompt, t, createCollection, selectedCollectionId]);

  const handleOpenBoard = useCallback(
    (id: string) => {
      loadDashboard(id);
      onClose();
    },
    [loadDashboard, onClose]
  );

  const handleBulkDelete = useCallback(async () => {
    const confirmed = await showConfirm(
      t('boardsModal.bulkDeleteConfirm', {
        count: multi.selectedIds.size,
        defaultValue: 'Delete {{count}} item(s)? This cannot be undone.',
      }),
      { title: 'Delete', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    for (const id of multi.selectedIds) {
      const isBoard = dashboards.some((d) => d.id === id);
      if (isBoard) await deleteDashboard(id);
      else await deleteCollection(id, 'move-to-parent');
    }
    multi.clearSelection();
  }, [showConfirm, t, multi, dashboards, deleteDashboard, deleteCollection]);

  const handleBulkPin = useCallback(async () => {
    for (const id of multi.selectedIds) {
      const board = dashboards.find((d) => d.id === id);
      if (board) await pinBoard(id);
    }
    multi.clearSelection();
  }, [multi, dashboards, pinBoard]);

  const handleBulkUnpin = useCallback(async () => {
    for (const id of multi.selectedIds) {
      const board = dashboards.find((d) => d.id === id);
      if (board) await unpinBoard(id);
    }
    multi.clearSelection();
  }, [multi, dashboards, unpinBoard]);

  const handleBulkMove = useCallback(async () => {
    // Minimal v1: prompt for the destination Collection name and look it up.
    // Replaced in Task 6.12 with a proper picker submenu.
    const destName = await showPrompt(
      t('boardsModal.moveDestination', {
        defaultValue: 'Collection name to move to (or leave blank for root)',
      }),
      { title: 'Move', confirmLabel: 'Move', placeholder: 'Math / Monday' }
    );
    if (destName === null) return;
    const dest = destName.trim()
      ? collections.find((c) => c.name === destName.trim())
      : null;
    const destId = dest?.id ?? null;
    for (const id of multi.selectedIds) {
      const isBoard = dashboards.some((d) => d.id === id);
      if (isBoard) await moveBoardToCollection(id, destId);
    }
    multi.clearSelection();
  }, [showPrompt, t, multi, collections, dashboards, moveBoardToCollection]);

  // Filter by search (substring on Board + Collection names)
  const filteredCollections = search.trim()
    ? collections.filter((c) =>
        c.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : collections;
  const filteredBoards = search.trim()
    ? dashboards.filter((d) =>
        d.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : dashboards;

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="boards-modal-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 md:h-16 px-4 flex items-center justify-between shadow-sm shrink-0">
          <h2 id="boards-modal-title" className="text-lg font-bold">
            {t('boardsModal.title', { defaultValue: 'Boards' })}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('boardsModal.close', { defaultValue: 'Close' })}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <BoardsModalHeader
          search={search}
          onSearchChange={setSearch}
          onCreateBoard={handleCreateBoard}
          onCreateCollection={handleCreateCollection}
          isSelectMode={multi.isSelectMode}
          selectedCount={multi.selectedIds.size}
          onClearSelection={multi.clearSelection}
          onBulkDelete={handleBulkDelete}
          onBulkMove={handleBulkMove}
          onBulkPin={handleBulkPin}
          onBulkUnpin={handleBulkUnpin}
        />

        <div className="flex-1 overflow-hidden flex">
          <CollectionTree
            collections={filteredCollections}
            boards={filteredBoards}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={setSelectedCollectionId}
          />
          <BoardGrid
            selectedCollectionId={selectedCollectionId}
            collections={filteredCollections}
            boards={filteredBoards}
            selectedIds={multi.selectedIds}
            isSelectMode={multi.isSelectMode}
            onSelectCollection={setSelectedCollectionId}
            onToggleSelect={multi.toggle}
            onOpenBoard={handleOpenBoard}
            onContextMenu={(_e, _target) => {
              /* wired in Task 6.10 */
            }}
          />
        </div>
      </div>
    </div>
  );
};
