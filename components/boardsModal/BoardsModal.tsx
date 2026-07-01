import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
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
import { BoardCardDragPreview } from './BoardCard';
import { CollectionCardDragPreview } from './CollectionCard';
import { ShareLinkCreatorModal } from '@/components/share/ShareLinkCreatorModal';
import { ShareCollectionLinkCreatorModal } from '@/components/share/ShareCollectionLinkCreatorModal';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
import { CollectionColorPicker } from './CollectionColorPicker';
import { useBoardsModalDnd } from './useBoardsModalDnd';
import { useBusyIdSet } from '@/hooks/useBusyIdSet';
import type { Collection, Dashboard } from '@/types';

// Lightweight target shape for the color picker — covers both flows
// (right-click on an existing Collection AND immediately-after-create) by
// holding only the identifying fields the picker needs, decoupled from the
// `collections` array which may not yet contain a freshly-created entry.
interface ColorPickerTarget {
  id: string;
  name: string;
  currentColor?: string;
}

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
    duplicateCollection,
    setDefaultDashboard,
    addToast,
    collectionsApi: {
      collections,
      createCollection,
      deleteCollection,
      renameCollection,
      setCollectionMetadata,
      moveCollection,
    },
  } = useDashboard();

  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(activeDashboard?.collectionId ?? null);
  const [search, setSearch] = useState('');
  const multi = useMultiSelect();
  // Per-id busy tracking for the Duplicate buttons. Gives a synchronous
  // rapid-click guard (the underlying ref is checked before the React
  // state update commits) plus a snapshot that drives the spinner +
  // disabled-state re-render on each card.
  const boardDuplicateBusy = useBusyIdSet();
  const collectionDuplicateBusy = useBusyIdSet();
  const {
    sensors,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    activeDragId,
  } = useBoardsModalDnd();

  // Resolve the active drag id (e.g. 'board:abc' / 'collection:xyz') into
  // the underlying object for rendering inside <DragOverlay>. Returns null
  // when no drag is active or the id no longer matches a live record (e.g.
  // deleted mid-drag — rare but possible).
  const dragPreview = (() => {
    if (!activeDragId) return null;
    const [kind, id] = activeDragId.split(':');
    if (kind === 'board') {
      const board = dashboards.find((d) => d.id === id);
      if (!board) return null;
      const parent = board.collectionId
        ? (collections.find((c) => c.id === board.collectionId) ?? null)
        : null;
      return (
        <BoardCardDragPreview
          board={board}
          collectionBadge={
            parent ? { name: parent.name, color: parent.color } : null
          }
        />
      );
    }
    if (kind === 'collection') {
      const c = collections.find((cc) => cc.id === id);
      if (!c) return null;
      return <CollectionCardDragPreview collection={c} />;
    }
    return null;
  })();
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
  const [colorPickerTarget, setColorPickerTarget] =
    useState<ColorPickerTarget | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isEscapeFromWidgetInput(e)) return;
      if (multi.isSelectMode) multi.clearSelection();
      else onClose();
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
    const trimmed = name.trim();
    // createCollection re-throws on Firestore failure (the hook itself does
    // not toast). Surface a user-facing toast here so the failure isn't an
    // unhandled rejection in the console.
    try {
      const newId = await createCollection(trimmed, selectedCollectionId);
      // Open the color picker for the freshly-created Collection. Decoupled
      // from the `collections` array — Firestore hasn't necessarily echoed
      // the new doc back through onSnapshot yet, so we pass id+name directly.
      // User can dismiss without picking; the Collection stays color-less.
      setColorPickerTarget({ id: newId, name: trimmed });
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
  // Same idea but for Collection-context "Move to…" (right-click on a
  // Collection card). Distinguished from board moves so the destination
  // picker routes through `moveCollection` instead of `moveBoardToCollection`.
  const [singleMoveCollectionId, setSingleMoveCollectionId] = useState<
    string | null
  >(null);

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
      // Single-Collection path (right-click on a Collection's "Move to…").
      // Routed through `moveCollection`, which validates against cycles
      // (moving a parent into one of its own descendants).
      if (singleMoveCollectionId) {
        const id = singleMoveCollectionId;
        setSingleMoveCollectionId(null);
        try {
          await moveCollection(id, destId);
          addToast(
            t('boardsModal.collectionMoved', {
              defaultValue: 'Collection moved',
            }),
            'success'
          );
        } catch (err) {
          // moveCollection throws on cycle/self-move with a descriptive
          // message — surface it verbatim so the user knows why the move
          // was rejected (e.g. "Cannot move a collection into one of its
          // own subcollections").
          addToast(
            err instanceof Error
              ? err.message
              : t('boardsModal.collectionMoveFailed', {
                  defaultValue: 'Failed to move Collection',
                }),
            'error'
          );
        }
        return;
      }

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
      singleMoveCollectionId,
      singleMoveTargetId,
      multi,
      dashboards,
      moveBoardToCollection,
      moveCollection,
      addToast,
      t,
      reportBulkResult,
      toastNoBoardsInSelection,
    ]
  );

  // For the right-click single-board move flow, pre-exclude the board's
  // current Collection from the destination picker — it's a no-op write
  // and a confusing UX ("Moved" toast when nothing changed). For the
  // single-Collection move flow, exclude the Collection itself so the
  // user can't pick "move A into A" (descendant cycles are caught by
  // moveCollection's runtime validation and toasted on failure).
  const moveMenuExcludeId =
    singleMoveCollectionId ??
    (singleMoveTargetId
      ? (dashboards.find((d) => d.id === singleMoveTargetId)?.collectionId ??
        null)
      : null);

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
            {t('boardsModal.title', { defaultValue: 'Boards & Collections' })}
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
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
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
              canShare={canShare}
              onSelectCollection={setSelectedCollectionId}
              onToggleSelect={multi.toggle}
              onOpenBoard={handleOpenBoard}
              onContextMenu={handleContextMenu}
              onDuplicateBoard={(id) =>
                void boardDuplicateBusy.run(id, () => duplicateDashboard(id))
              }
              onDuplicateCollection={(id) =>
                void collectionDuplicateBusy.run(id, () =>
                  duplicateCollection(id)
                )
              }
              isBoardDuplicating={boardDuplicateBusy.isBusy}
              isCollectionDuplicating={collectionDuplicateBusy.isBusy}
              onShareBoard={(b) => setShareTarget(b)}
              onShareCollection={(c) => setShareCollectionTarget(c)}
            />
          </div>
          <DragOverlay dropAnimation={null}>{dragPreview}</DragOverlay>
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
              onDuplicate={() =>
                void boardDuplicateBusy.run(board.id, () =>
                  duplicateDashboard(board.id)
                )
              }
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
                setSingleMoveCollectionId(c.id);
                setMoveMenuOpen(true);
              }}
              onColor={() =>
                setColorPickerTarget({
                  id: c.id,
                  name: c.name,
                  currentColor: c.color,
                })
              }
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
                  (d) =>
                    (d.collectionId ?? null) ===
                    saveAsCollectionTemplateTarget.id
                ),
              }
            : null
        }
      />
      <CreateFromTemplateModal
        isOpen={createFromTemplateOpen}
        onClose={() => setCreateFromTemplateOpen(false)}
      />
      {colorPickerTarget && (
        <CollectionColorPicker
          collectionName={colorPickerTarget.name}
          currentColor={colorPickerTarget.currentColor}
          onSelect={async (color) => {
            // Optimistically keep the picker open with the new color
            // highlighted while the write resolves. setCollectionMetadata
            // re-throws on failure without toasting itself — the catch
            // below is the only user-facing failure surface, so don't
            // remove it.
            try {
              await setCollectionMetadata(colorPickerTarget.id, { color });
              setColorPickerTarget((prev) =>
                prev && prev.id === colorPickerTarget.id
                  ? { ...prev, currentColor: color }
                  : prev
              );
            } catch {
              addToast(
                t('boardsModal.colorSaveFailed', {
                  defaultValue: 'Failed to save color',
                }),
                'error'
              );
            }
          }}
          onClose={() => setColorPickerTarget(null)}
        />
      )}
    </div>
  );
};
