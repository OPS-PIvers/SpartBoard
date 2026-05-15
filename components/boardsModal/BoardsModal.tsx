import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCollections } from '@/hooks/useCollections';
import { CollectionTree } from './CollectionTree';
import { BoardGrid } from './BoardGrid';
import { BoardsModalHeader } from './BoardsModalHeader';
import { useMultiSelect } from './useMultiSelect';
import { BoardContextMenu } from './BoardContextMenu';
import { CollectionContextMenu } from './CollectionContextMenu';
import { ShareLinkCreatorModal } from '@/components/share/ShareLinkCreatorModal';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';
import { useBoardsModalDnd } from './useBoardsModalDnd';
import type { Dashboard } from '@/types';

interface BoardsModalProps {
  onClose: () => void;
}

export const BoardsModal: React.FC<BoardsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { showPrompt, showConfirm } = useDialog();
  const { user, isAdmin, canAccessFeature } = useAuth();
  const canShare = canAccessFeature('dashboard-sharing');
  const {
    dashboards,
    activeDashboard,
    loadDashboard,
    createNewDashboard,
    deleteDashboard,
    moveBoardToCollection,
    pinBoard,
    unpinBoard,
    renameDashboard,
    duplicateDashboard,
    setDefaultDashboard,
  } = useDashboard();
  const {
    collections,
    createCollection,
    deleteCollection,
    renameCollection,
    setCollectionMetadata,
  } = useCollections(user?.uid);

  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(activeDashboard?.collectionId ?? null);
  const [search, setSearch] = useState('');
  const multi = useMultiSelect();
  const { sensors, handleDragEnd } = useBoardsModalDnd();
  const [contextMenu, setContextMenu] = useState<{
    type: 'board' | 'collection';
    id: string;
    position: { x: number; y: number };
  } | null>(null);
  const [shareTarget, setShareTarget] = useState<Dashboard | null>(null);
  const [saveAsTemplateTarget, setSaveAsTemplateTarget] =
    useState<Dashboard | null>(null);

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

  const handleContextMenu = useCallback(
    (
      e: React.MouseEvent,
      target: { type: 'board' | 'collection'; id: string }
    ) => {
      e.preventDefault();
      setContextMenu({ ...target, position: { x: e.clientX, y: e.clientY } });
    },
    []
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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
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
              onContextMenu={handleContextMenu}
            />
          </div>
        </DndContext>
      </div>

      {contextMenu?.type === 'board' &&
        (() => {
          const board = dashboards.find((d) => d.id === contextMenu.id);
          if (!board) return null;
          return (
            <BoardContextMenu
              board={board}
              position={contextMenu.position}
              canShare={canShare}
              isAdmin={Boolean(isAdmin)}
              onClose={() => setContextMenu(null)}
              onOpen={() => handleOpenBoard(board.id)}
              onRename={async () => {
                const next = await showPrompt(
                  t('common.rename', { defaultValue: 'Rename' }),
                  {
                    title: 'Rename',
                    confirmLabel: 'Save',
                    placeholder: board.name,
                  }
                );
                if (next?.trim()) await renameDashboard(board.id, next.trim());
              }}
              onDuplicate={() => void duplicateDashboard(board.id)}
              onSetDefault={() => void setDefaultDashboard(board.id)}
              onTogglePin={() =>
                board.isPinned ? unpinBoard(board.id) : pinBoard(board.id)
              }
              onMove={handleBulkMove}
              onShare={() => setShareTarget(board)}
              onSaveAsTemplate={() => setSaveAsTemplateTarget(board)}
              onDelete={async () => {
                const ok = await showConfirm(
                  t('boardsModal.deleteBoardConfirm', {
                    defaultValue: 'Delete this Board?',
                  }),
                  { title: 'Delete', variant: 'danger', confirmLabel: 'Delete' }
                );
                if (ok) await deleteDashboard(board.id);
              }}
            />
          );
        })()}

      {contextMenu?.type === 'collection' &&
        (() => {
          const c = collections.find((cc) => cc.id === contextMenu.id);
          if (!c) return null;
          return (
            <CollectionContextMenu
              position={contextMenu.position}
              onClose={() => setContextMenu(null)}
              onOpen={() => setSelectedCollectionId(c.id)}
              onRename={async () => {
                const next = await showPrompt('Rename Collection', {
                  title: 'Rename',
                  confirmLabel: 'Save',
                  placeholder: c.name,
                });
                if (next?.trim()) await renameCollection(c.id, next.trim());
              }}
              onMove={() => {
                /* implemented in Task 6.12 */
              }}
              onColor={async () => {
                const color = await showPrompt('Color (hex, e.g., #ad2122)', {
                  title: 'Set color',
                  confirmLabel: 'Save',
                  placeholder: c.color ?? '#2d3f89',
                });
                if (color) await setCollectionMetadata(c.id, { color });
              }}
              onDelete={async () => {
                const ok = await showConfirm(
                  t('boardsModal.deleteCollectionConfirm', {
                    defaultValue:
                      'Delete this Collection? Boards inside will move to its parent.',
                  }),
                  { title: 'Delete', variant: 'danger', confirmLabel: 'Delete' }
                );
                if (ok) await deleteCollection(c.id, 'move-to-parent');
              }}
            />
          );
        })()}

      <ShareLinkCreatorModal
        isOpen={!!shareTarget}
        dashboard={shareTarget}
        onClose={() => setShareTarget(null)}
      />
      <SaveAsTemplateModal
        isOpen={!!saveAsTemplateTarget}
        currentDashboard={saveAsTemplateTarget}
        onClose={() => setSaveAsTemplateTarget(null)}
      />
    </div>
  );
};
