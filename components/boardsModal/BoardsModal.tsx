import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { CollectionTree } from './CollectionTree';
import { BoardGrid } from './BoardGrid';
import { BoardsModalHeader } from './BoardsModalHeader';
import { useMultiSelect } from './useMultiSelect';
import { BoardContextMenu } from './BoardContextMenu';
import { CollectionContextMenu } from './CollectionContextMenu';
import { MoveToCollectionMenu } from './MoveToCollectionMenu';
import { ShareLinkCreatorModal } from '@/components/share/ShareLinkCreatorModal';
import { ShareCollectionLinkCreatorModal } from '@/components/share/ShareCollectionLinkCreatorModal';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
import { useBoardsModalDnd } from './useBoardsModalDnd';
import type { Collection, Dashboard } from '@/types';

interface BoardsModalProps {
  onClose: () => void;
}

export const BoardsModal: React.FC<BoardsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { showPrompt, showConfirm } = useDialog();
  const { isAdmin, canAccessFeature } = useAuth();
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
    addToast,
    collectionsApi: {
      collections,
      createCollection,
      deleteCollection,
      renameCollection,
      setCollectionMetadata,
    },
  } = useDashboard();

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
  const [shareCollectionTarget, setShareCollectionTarget] =
    useState<Collection | null>(null);
  const [saveAsTemplateTarget, setSaveAsTemplateTarget] =
    useState<Dashboard | null>(null);
  const [saveAsCollectionTemplateTarget, setSaveAsCollectionTemplateTarget] =
    useState<Collection | null>(null);
  const [createFromTemplateOpen, setCreateFromTemplateOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);

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
    // createNewDashboard already toasts on failure; the awaited promise
    // throws on auth-required path. Wrap so an unhandled rejection doesn't
    // surface in the browser console alongside the user-facing toast.
    try {
      await createNewDashboard(name.trim(), undefined, {
        collectionId: selectedCollectionId,
      });
    } catch {
      /* error already toasted by createNewDashboard */
    }
  }, [showPrompt, t, createNewDashboard, selectedCollectionId]);

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
    // createCollection re-throws on Firestore failure (the hook itself does
    // not toast). Surface a user-facing toast here so the failure isn't an
    // unhandled rejection in the console.
    try {
      await createCollection(name.trim(), selectedCollectionId);
    } catch {
      addToast(
        t('boardsModal.createCollectionFailed', {
          defaultValue: 'Failed to create Collection',
        }),
        'error'
      );
    }
  }, [showPrompt, t, createCollection, selectedCollectionId, addToast]);

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

  // Tracks a single board the user invoked a context-menu action on. When set,
  // the move picker operates on this board alone instead of the multi-select
  // bucket — fixes the right-click "Move to…" path where the right-clicked
  // board may not be in the selection (or selection may be empty).
  const [singleMoveTargetId, setSingleMoveTargetId] = useState<string | null>(
    null
  );

  // Report results of a multi-write fan-out. If some writes failed the
  // user sees a partial-success toast instead of silent skips.
  const reportBulkResult = useCallback(
    (
      results: PromiseSettledResult<unknown>[],
      successKey: string,
      successDefault: string,
      partialKey: string,
      partialDefault: string,
      allFailKey: string,
      allFailDefault: string
    ) => {
      const total = results.length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = total - failed;
      if (failed === 0) {
        addToast(t(successKey, { count: total, defaultValue: successDefault }));
      } else if (succeeded === 0) {
        addToast(t(allFailKey, { defaultValue: allFailDefault }), 'error');
      } else {
        addToast(
          t(partialKey, {
            succeeded,
            failed,
            defaultValue: partialDefault,
          }),
          'error'
        );
      }
    },
    [addToast, t]
  );

  // Toast when the user fires a bulk action with no eligible Boards in the
  // selection (e.g. only Collections selected for a "pin" action) so they
  // don't see a misleading "Pinned 0 board(s)" success.
  const toastNoBoardsInSelection = useCallback(() => {
    addToast(
      t('boardsModal.noBoardsInSelection', {
        defaultValue: "No Boards in selection — Collections can't be used here",
      }),
      'info'
    );
  }, [addToast, t]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(multi.selectedIds);
    if (ids.length === 0) return;
    const confirmed = await showConfirm(
      t('boardsModal.bulkDeleteConfirm', {
        count: ids.length,
        defaultValue: 'Delete {{count}} item(s)? This cannot be undone.',
      }),
      { title: 'Delete', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    // deleteDashboard already toasts on failure internally; we let it stay
    // silent on success and rely on the aggregate report below. For
    // deleteCollection (no built-in toasting yet), the aggregate is the only
    // surface.
    const results = await Promise.allSettled(
      ids.map((id) =>
        dashboards.some((d) => d.id === id)
          ? deleteDashboard(id)
          : deleteCollection(id, 'move-to-parent')
      )
    );
    multi.clearSelection();
    reportBulkResult(
      results,
      'boardsModal.bulkDeleteSuccess',
      'Deleted {{count}} item(s)',
      'boardsModal.bulkPartialFailure',
      'Deleted {{succeeded}} item(s) — {{failed}} failed',
      'boardsModal.bulkAllFailed',
      'No items could be deleted — please retry'
    );
  }, [
    showConfirm,
    t,
    multi,
    dashboards,
    deleteDashboard,
    deleteCollection,
    reportBulkResult,
  ]);

  const handleBulkPin = useCallback(async () => {
    const ids = Array.from(multi.selectedIds).filter((id) =>
      dashboards.some((d) => d.id === id)
    );
    if (ids.length === 0) {
      toastNoBoardsInSelection();
      return;
    }
    // silent: true → bulk fan-out suppresses per-item action toasts so the
    // user sees one aggregate result instead of N individual notifications.
    const results = await Promise.allSettled(
      ids.map((id) => pinBoard(id, { silent: true }))
    );
    multi.clearSelection();
    reportBulkResult(
      results,
      'boardsModal.bulkPinSuccess',
      'Pinned {{count}} board(s)',
      'boardsModal.bulkPartialFailure',
      'Pinned {{succeeded}} board(s) — {{failed}} failed',
      'boardsModal.bulkAllFailed',
      'No boards could be pinned — please retry'
    );
  }, [multi, dashboards, pinBoard, reportBulkResult, toastNoBoardsInSelection]);

  const handleBulkUnpin = useCallback(async () => {
    const ids = Array.from(multi.selectedIds).filter((id) =>
      dashboards.some((d) => d.id === id)
    );
    if (ids.length === 0) {
      toastNoBoardsInSelection();
      return;
    }
    const results = await Promise.allSettled(
      ids.map((id) => unpinBoard(id, { silent: true }))
    );
    multi.clearSelection();
    reportBulkResult(
      results,
      'boardsModal.bulkUnpinSuccess',
      'Unpinned {{count}} board(s)',
      'boardsModal.bulkPartialFailure',
      'Unpinned {{succeeded}} board(s) — {{failed}} failed',
      'boardsModal.bulkAllFailed',
      'No boards could be unpinned — please retry'
    );
  }, [
    multi,
    dashboards,
    unpinBoard,
    reportBulkResult,
    toastNoBoardsInSelection,
  ]);

  const handleBulkMove = useCallback(() => {
    setSingleMoveTargetId(null);
    setMoveMenuOpen(true);
  }, []);

  // Right-click context-menu "Move to…" — operates on the right-clicked board
  // regardless of whether it's part of the bulk selection.
  const handleSingleMove = useCallback((boardId: string) => {
    setSingleMoveTargetId(boardId);
    setMoveMenuOpen(true);
  }, []);

  const handleMoveDestinationPicked = useCallback(
    async (destId: string | null) => {
      // Single-board path (right-click "Move to…") takes precedence over
      // the bulk selection — see handleSingleMove.
      if (singleMoveTargetId) {
        const id = singleMoveTargetId;
        setSingleMoveTargetId(null);
        const isBoard = dashboards.some((d) => d.id === id);
        if (!isBoard) return;
        try {
          await moveBoardToCollection(id, destId);
        } catch {
          // moveBoardToCollection already toasted + rolled back — swallow
          // the rethrow here so the modal doesn't surface twice. NOTE:
          // single-board path relies on the action's own toast as the user
          // surface; if that ever moves into reportBulkResult, this catch
          // becomes a real silent-failure.
        }
        return;
      }

      const ids = Array.from(multi.selectedIds).filter((id) =>
        dashboards.some((d) => d.id === id)
      );
      if (ids.length === 0) {
        toastNoBoardsInSelection();
        return;
      }
      const results = await Promise.allSettled(
        ids.map((id) => moveBoardToCollection(id, destId, { silent: true }))
      );
      multi.clearSelection();
      reportBulkResult(
        results,
        'boardsModal.bulkMoveSuccess',
        'Moved {{count}} board(s)',
        'boardsModal.bulkPartialFailure',
        'Moved {{succeeded}} board(s) — {{failed}} failed',
        'boardsModal.bulkAllFailed',
        'No boards could be moved — please retry'
      );
    },
    [
      singleMoveTargetId,
      multi,
      dashboards,
      moveBoardToCollection,
      reportBulkResult,
      toastNoBoardsInSelection,
    ]
  );

  // For the right-click single-board move flow, pre-exclude the board's
  // current Collection from the destination picker — it's a no-op write
  // and a confusing UX ("Moved" toast when nothing changed).
  const moveMenuExcludeId = singleMoveTargetId
    ? (dashboards.find((d) => d.id === singleMoveTargetId)?.collectionId ??
      null)
    : null;

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
          onCreateFromTemplate={() => setCreateFromTemplateOpen(true)}
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
              onSetDefault={() => {
                // Action toasts on failure; .catch prevents the rethrow
                // from surfacing as an unhandled rejection in the console.
                setDefaultDashboard(board.id).catch(() => undefined);
              }}
              onTogglePin={() => {
                const op = board.isPinned
                  ? unpinBoard(board.id)
                  : pinBoard(board.id);
                op.catch(() => undefined);
              }}
              onMove={() => handleSingleMove(board.id)}
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
              canShare={canShare}
              onShare={() => setShareCollectionTarget(c)}
              canSaveAsTemplate={Boolean(isAdmin)}
              onSaveAsTemplate={() => setSaveAsCollectionTemplateTarget(c)}
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
                const color = await showPrompt(
                  t('boardsModal.colorPrompt', {
                    defaultValue: 'Color (hex, e.g., #ad2122)',
                  }),
                  {
                    title: t('boardsModal.menu.color', {
                      defaultValue: 'Set color',
                    }),
                    confirmLabel: 'Save',
                    placeholder: c.color ?? '#2d3f89',
                  }
                );
                if (!color) return;
                // Restrict to safe hex — `style={{ color }}` rejects bad
                // values silently, but unsanitized user input shouldn't be
                // persisted at all. Accept #RGB / #RRGGBB only.
                const hex = color.trim();
                const isValidHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex);
                if (!isValidHex) {
                  addToast(
                    t('boardsModal.colorInvalid', {
                      defaultValue:
                        'Invalid color — use hex like #ad2122 or #abc.',
                    }),
                    'error'
                  );
                  return;
                }
                await setCollectionMetadata(c.id, { color: hex });
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

      {moveMenuOpen && (
        <MoveToCollectionMenu
          collections={collections}
          excludeId={moveMenuExcludeId}
          onMove={handleMoveDestinationPicked}
          onClose={() => setMoveMenuOpen(false)}
        />
      )}

      <ShareLinkCreatorModal
        isOpen={!!shareTarget}
        dashboard={shareTarget}
        onClose={() => setShareTarget(null)}
      />
      {shareCollectionTarget && (
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={shareCollectionTarget}
          boards={dashboards.filter(
            (d) => (d.collectionId ?? null) === shareCollectionTarget.id
          )}
          onClose={() => setShareCollectionTarget(null)}
        />
      )}
      <SaveAsTemplateModal
        isOpen={saveAsTemplateTarget !== null}
        onClose={() => setSaveAsTemplateTarget(null)}
        target={
          saveAsTemplateTarget
            ? { kind: 'board', dashboard: saveAsTemplateTarget }
            : null
        }
      />
      <SaveAsTemplateModal
        isOpen={saveAsCollectionTemplateTarget !== null}
        onClose={() => setSaveAsCollectionTemplateTarget(null)}
        target={
          saveAsCollectionTemplateTarget
            ? {
                kind: 'collection',
                collection: saveAsCollectionTemplateTarget,
                boards: dashboards.filter(
                  (d) => d.collectionId === saveAsCollectionTemplateTarget.id
                ),
              }
            : null
        }
      />
      <CreateFromTemplateModal
        isOpen={createFromTemplateOpen}
        onClose={() => setCreateFromTemplateOpen(false)}
      />
    </div>
  );
};
