import { tourAttr } from '@/config/tourAnchors';
import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { getOpenModalCount } from '@/components/common/modalStore';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { useDialog } from '@/context/useDialog';
import {
  useConfirmLinkedBoardRemoval,
  useConfirmLinkedCollectionMove,
} from '@/hooks/useConfirmLinkedBoardRemoval';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { CollectionTree } from './CollectionTree';
import { filterCollectionsBySearch } from './collectionTreeUtils';
import { BoardGrid } from './BoardGrid';
import { BoardsModalHeader } from './BoardsModalHeader';
import { useMultiSelect } from './useMultiSelect';
import { BoardContextMenu } from './BoardContextMenu';
import { CollectionContextMenu } from './CollectionContextMenu';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import { DeleteFolderDialog } from '@/components/common/library/DeleteFolderDialog';
import { folderColorSwatch } from '@/components/common/library/folderColors';
import { collectDescendantIds } from '@/utils/folderTree';
import {
  BOARD_NOUN,
  collectionAsFolder,
  collectionDeleteCounts,
} from './collectionFolders';
import { BoardCardDragPreview } from './BoardCard';
import { CollectionCardDragPreview } from './CollectionCard';
import { ShareLinkCreatorModal } from '@/components/share/ShareLinkCreatorModal';
import { ShareCollectionLinkCreatorModal } from '@/components/share/ShareCollectionLinkCreatorModal';
import {
  shareCollectionTree,
  touchesLiveCollectionShare,
} from '@/utils/sharedCollectionTree';
import {
  ShareWithSubModal,
  type SubShareTarget,
} from '@/components/share/ShareWithSubModal';
import { SubSharesPanel } from './SubSharesPanel';
import { useSubShares } from './useSubShares';
import { SaveAsTemplateModal } from '@/components/admin/SaveAsTemplateModal';
import { CreateFromTemplateModal } from './CreateFromTemplateModal';
import { parseDndId, useBoardsModalDnd } from './useBoardsModalDnd';
import { DropIndicatorContext, boardsInView } from './dropIndicator';
import { useBusyIdSet } from '@/hooks/useBusyIdSet';
import type { Collection, Dashboard } from '@/types';

interface BoardsModalProps {
  onClose: () => void;
}

export const BoardsModal: React.FC<BoardsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { showPrompt, showConfirm } = useDialog();
  const confirmLinkedRemoval = useConfirmLinkedBoardRemoval();
  const confirmLinkedCollectionMove = useConfirmLinkedCollectionMove();
  const { isAdmin, canAccessFeature } = useAuth();
  const canShare = canAccessFeature('dashboard-sharing');
  const canSubShare = canShare && canAccessFeature('substitute-sharing');
  const {
    dashboards,
    activeDashboard,
    loadDashboard,
    createNewDashboard,
    deleteDashboard,
    moveBoardToCollection,
    countLinkedBoardRemovals,
    stopSharingCollection,
    leaveSharedCollection,
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
  const subShares = useSubShares(canSubShare);

  // Filter by search (substring on Board + Collection names)
  const searchTerm = search.trim().toLowerCase();
  const filteredCollections = searchTerm
    ? collections.filter((c) => c.name.toLowerCase().includes(searchTerm))
    : collections;
  // The sidebar tree needs matches' ancestors too, or a non-matching parent's
  // exclusion makes buildChildrenByParent misread the matching child as orphaned.
  const treeCollections = searchTerm
    ? filterCollectionsBySearch(collections, searchTerm)
    : collections;
  const filteredBoards = searchTerm
    ? dashboards.filter((d) => d.name.toLowerCase().includes(searchTerm))
    : dashboards;

  const {
    sensors,
    collisionDetection,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
    activeDragId,
    dropIndicator,
  } = useBoardsModalDnd({
    visibleBoardIds: boardsInView(
      filteredBoards,
      selectedCollectionId,
      collections,
      searchTerm !== ''
    ).map((b) => b.id),
  });

  // Resolve the active drag id (e.g. 'board:abc' / 'collection:xyz') into
  // the underlying object for rendering inside <DragOverlay>. Returns null
  // when no drag is active or the id no longer matches a live record (e.g.
  // deleted mid-drag — rare but possible).
  const dragPreview = (() => {
    if (!activeDragId) return null;
    const { kind, id } = parseDndId(activeDragId);
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
  const [subShareTarget, setSubShareTarget] = useState<SubShareTarget | null>(
    null
  );
  const [saveAsTemplateTarget, setSaveAsTemplateTarget] =
    useState<Dashboard | null>(null);
  const [saveAsCollectionTemplateTarget, setSaveAsCollectionTemplateTarget] =
    useState<Collection | null>(null);
  const [createFromTemplateOpen, setCreateFromTemplateOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [deleteCollectionTarget, setDeleteCollectionTarget] =
    useState<Collection | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isEscapeFromWidgetInput(e)) return;
      // A stacked Modal owns this Escape.
      if (getOpenModalCount() > 0) return;
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

  // New and Rename name the collection inline on its card, like a library folder.
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [renamingCollectionId, setRenamingCollectionId] = useState<
    string | null
  >(null);

  const handleCreateCollection = useCallback(
    async (name: string) => {
      setCreatingCollection(false);
      // createCollection re-throws on Firestore failure without toasting.
      try {
        await createCollection(name, selectedCollectionId);
      } catch {
        addToast(
          t('boardsModal.createCollectionFailed', {
            defaultValue: 'Failed to create Collection',
          }),
          'error'
        );
      }
    },
    [t, createCollection, selectedCollectionId, addToast]
  );

  const handleRenameCollection = useCallback(
    async (id: string, name: string) => {
      setRenamingCollectionId(null);
      try {
        await renameCollection(id, name);
      } catch {
        addToast(
          t('boardsModal.renameCollectionFailed', {
            defaultValue: 'Failed to rename Collection',
          }),
          'error'
        );
      }
    },
    [t, renameCollection, addToast]
  );

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

  // Edit button: same menu, anchored under the button that opened it.
  const handleOpenEditMenu = useCallback(
    (
      anchor: HTMLElement,
      target: { type: 'board' | 'collection'; id: string }
    ) => {
      const rect = anchor.getBoundingClientRect();
      setContextMenu({
        ...target,
        position: { x: rect.left, y: rect.bottom + 4 },
      });
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
    const boardIds = ids.filter((id) => dashboards.some((d) => d.id === id));
    if (!(await confirmLinkedRemoval(boardIds, { kind: 'delete' }))) return;
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
    confirmLinkedRemoval,
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
        if (!(await confirmLinkedCollectionMove(id, destId))) return;
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
        if (
          !(await confirmLinkedRemoval([id], {
            kind: 'move',
            collectionId: destId,
          }))
        )
          return;
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
      if (
        !(await confirmLinkedRemoval(ids, {
          kind: 'move',
          collectionId: destId,
        }))
      )
        return;
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
      confirmLinkedRemoval,
      confirmLinkedCollectionMove,
      moveBoardToCollection,
      moveCollection,
      addToast,
      t,
      reportBulkResult,
      toastNoBoardsInSelection,
    ]
  );

  // The current location shows checked and picking it is a no-op; a collection can't move into itself or below itself.
  const movingCollection = singleMoveCollectionId
    ? collections.find((c) => c.id === singleMoveCollectionId)
    : undefined;
  const movingBoard = singleMoveTargetId
    ? dashboards.find((d) => d.id === singleMoveTargetId)
    : undefined;
  const moveMenuCurrentId: string | null | undefined = movingCollection
    ? movingCollection.parentCollectionId
    : movingBoard
      ? (movingBoard.collectionId ?? null)
      : undefined;
  const moveBlocked = movingCollection
    ? new Set([
        movingCollection.id,
        ...collectDescendantIds(
          movingCollection.id,
          collections,
          (c) => c.parentCollectionId
        ),
      ])
    : null;
  const moveTargets = collections
    .filter((c) => !moveBlocked?.has(c.id))
    .map(collectionAsFolder);
  const movingName = movingCollection?.name ?? movingBoard?.name;
  const moveMenuTitle = movingName
    ? t('boardsModal.moveNamedTitle', {
        name: movingName,
        defaultValue: 'Move “{{name}}” to',
      })
    : t('boardsModal.moveTitle', { defaultValue: 'Move to' });

  return (
    <div
      className="fixed inset-0 z-modal bg-slate-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="boards-modal-title"
    >
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        <div className="bg-linear-to-r from-brand-blue-primary to-brand-blue-dark text-white h-14 md:h-16 px-4 flex items-center shadow-xs shrink-0 gap-2">
          <button
            onClick={onClose}
            aria-label={t('boardsModal.backToBoard', {
              defaultValue: 'Back to board',
            })}
            title={t('boardsModal.backToBoard', {
              defaultValue: 'Back to board',
            })}
            {...tourAttr('boards-modal.close')}
            className="relative touch-target-expand p-2 -ml-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
          <h2 id="boards-modal-title" className="text-lg font-bold">
            {t('boardsModal.title', { defaultValue: 'Boards & Collections' })}
          </h2>
        </div>

        <BoardsModalHeader
          search={search}
          onSearchChange={setSearch}
          onCreateBoard={handleCreateBoard}
          onCreateCollection={() => setCreatingCollection(true)}
          onCreateFromTemplate={() => setCreateFromTemplateOpen(true)}
          isSelectMode={multi.isSelectMode}
          selectedCount={multi.selectedIds.size}
          onClearSelection={multi.clearSelection}
          onBulkDelete={handleBulkDelete}
          onBulkMove={handleBulkMove}
          onBulkPin={handleBulkPin}
          onBulkUnpin={handleBulkUnpin}
        />

        {canShare && (
          <SubSharesPanel
            shares={subShares.shares}
            busyShareId={subShares.busyShareId}
            onCopyLink={subShares.copyLink}
            onUpdateNow={subShares.updateNow}
            onExtend={subShares.extend}
            onEnd={subShares.end}
          />
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <DropIndicatorContext.Provider value={dropIndicator}>
            <div className="flex-1 overflow-hidden flex">
              <CollectionTree
                collections={treeCollections}
                boards={filteredBoards}
                selectedCollectionId={selectedCollectionId}
                onSelectCollection={setSelectedCollectionId}
              />
              <BoardGrid
                selectedCollectionId={selectedCollectionId}
                collections={filteredCollections}
                allCollections={collections}
                boards={filteredBoards}
                searchActive={searchTerm !== ''}
                selectedIds={multi.selectedIds}
                canShare={canShare}
                onSelectCollection={setSelectedCollectionId}
                onToggleSelect={multi.toggle}
                onOpenBoard={handleOpenBoard}
                onContextMenu={handleContextMenu}
                onOpenEditMenu={handleOpenEditMenu}
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
                creatingCollection={creatingCollection}
                onCreateCollection={(name) => void handleCreateCollection(name)}
                onCancelCreateCollection={() => setCreatingCollection(false)}
                renamingCollectionId={renamingCollectionId}
                onRenameCollection={(id, name) =>
                  void handleRenameCollection(id, name)
                }
                onCancelRenameCollection={() => setRenamingCollectionId(null)}
              />
            </div>
          </DropIndicatorContext.Provider>
          {/* Centered on the pointer: the preview is smaller than the card it came from. */}
          <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
            {dragPreview && (
              <div className="flex h-full w-full items-center justify-center">
                {dragPreview}
              </div>
            )}
          </DragOverlay>
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
              onShareWithSub={
                canSubShare
                  ? () => setSubShareTarget({ kind: 'board', dashboard: board })
                  : undefined
              }
              subShareEndsAt={subShares.endsAtFor(board.id)}
              onSaveAsTemplate={() => setSaveAsTemplateTarget(board)}
              onDelete={async () => {
                // A board leaving a shared collection gets the remove-for-everyone confirm instead.
                const ok =
                  countLinkedBoardRemovals([board.id], { kind: 'delete' }) > 0
                    ? await confirmLinkedRemoval([board.id], { kind: 'delete' })
                    : await showConfirm(
                        t('boardsModal.deleteBoardConfirm', {
                          defaultValue: 'Delete this Board?',
                        }),
                        {
                          title: 'Delete',
                          variant: 'danger',
                          confirmLabel: 'Delete',
                        }
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
              onShareWithSub={
                canSubShare
                  ? () =>
                      setSubShareTarget({ kind: 'collection', collection: c })
                  : undefined
              }
              subShareEndsAt={subShares.endsAtFor(c.id)}
              liveShareRole={
                c.linkedCollectionId && !c.linkedCollectionEnded
                  ? c.linkedCollectionRole === 'owner'
                    ? 'host'
                    : 'member'
                  : null
              }
              onStopSharing={async () => {
                const label = t('collectionMenu.stopSharing', {
                  defaultValue: 'Stop sharing',
                });
                const ok = await showConfirm(
                  t('collectionMenu.stopSharingConfirm', {
                    defaultValue:
                      'Stop sharing this collection? Synced teachers keep their own copy. View-only teachers lose it.',
                  }),
                  { title: label, variant: 'warning', confirmLabel: label }
                );
                if (ok) await stopSharingCollection(c.id);
              }}
              onLeaveShared={async () => {
                const label = t('collectionMenu.leaveShared', {
                  defaultValue: 'Leave shared collection',
                });
                const ok = await showConfirm(
                  c.linkedCollectionRole === 'viewer'
                    ? t('collectionMenu.leaveSharedViewerConfirm', {
                        defaultValue:
                          'Leave this shared collection? It will be removed from your account.',
                      })
                    : t('collectionMenu.leaveSharedConfirm', {
                        defaultValue:
                          'Leave this shared collection? You keep a copy of its boards, but they stop updating.',
                      }),
                  { title: label, variant: 'warning', confirmLabel: label }
                );
                if (ok) await leaveSharedCollection(c.id);
              }}
              canSaveAsTemplate={Boolean(isAdmin)}
              onSaveAsTemplate={() => setSaveAsCollectionTemplateTarget(c)}
              onRename={() => setRenamingCollectionId(c.id)}
              onMove={() => {
                setSingleMoveCollectionId(c.id);
                setMoveMenuOpen(true);
              }}
              color={folderColorSwatch(c.color)?.id ?? null}
              onColor={async (id) => {
                try {
                  await setCollectionMetadata(c.id, {
                    color: id ? (folderColorSwatch(id)?.hex ?? '') : '',
                  });
                } catch {
                  addToast(
                    t('boardsModal.colorSaveFailed', {
                      defaultValue: 'Failed to save color',
                    }),
                    'error'
                  );
                }
              }}
              onDelete={() => setDeleteCollectionTarget(c)}
            />
          );
        })()}

      {moveMenuOpen && (
        <FolderPickerPopover
          variant="dialog"
          folders={moveTargets}
          selectedFolderId={moveMenuCurrentId}
          title={moveMenuTitle}
          rootLabel={t('boardsModal.rootLabel', { defaultValue: 'All Boards' })}
          rootAnchor={tourAttr('boards-modal.move-to-root')}
          rowAnchor={() => tourAttr('boards-modal.move-target')}
          onSelect={(destId) => {
            if (destId === moveMenuCurrentId) return;
            void handleMoveDestinationPicked(destId);
          }}
          onClose={() => {
            setMoveMenuOpen(false);
            setSingleMoveCollectionId(null);
            setSingleMoveTargetId(null);
          }}
        />
      )}
      {deleteCollectionTarget && (
        <DeleteFolderDialog
          folder={collectionAsFolder(deleteCollectionTarget)}
          parentName={
            collections.find(
              (p) => p.id === deleteCollectionTarget.parentCollectionId
            )?.name ??
            t('boardsModal.rootLabel', { defaultValue: 'All Boards' })
          }
          {...collectionDeleteCounts(
            deleteCollectionTarget.id,
            collections,
            dashboards
          )}
          noun={BOARD_NOUN}
          canDeleteItems={false}
          onCancel={() => setDeleteCollectionTarget(null)}
          onConfirm={async () => {
            try {
              await deleteCollection(
                deleteCollectionTarget.id,
                'move-to-parent'
              );
            } catch {
              throw new Error(
                t('boardsModal.deleteCollectionFailed', {
                  defaultValue: 'Failed to delete Collection',
                })
              );
            }
            setDeleteCollectionTarget(null);
          }}
        />
      )}

      <ShareLinkCreatorModal
        isOpen={!!shareTarget}
        dashboard={shareTarget}
        onClose={() => setShareTarget(null)}
        onShareWithSub={
          shareTarget && canSubShare
            ? () => {
                setSubShareTarget({ kind: 'board', dashboard: shareTarget });
                setShareTarget(null);
              }
            : undefined
        }
      />
      {shareCollectionTarget && (
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={shareCollectionTarget}
          {...shareCollectionTree(
            shareCollectionTarget,
            collections,
            dashboards
          )}
          inLiveShare={touchesLiveCollectionShare(
            shareCollectionTarget,
            collections
          )}
          onClose={() => setShareCollectionTarget(null)}
          onShareWithSub={
            canSubShare
              ? () => {
                  setSubShareTarget({
                    kind: 'collection',
                    collection: shareCollectionTarget,
                  });
                  setShareCollectionTarget(null);
                }
              : undefined
          }
        />
      )}
      {/* Mounted only while open, so a second trip through the dialog starts clean. */}
      {subShareTarget && canSubShare && (
        <ShareWithSubModal
          isOpen
          target={subShareTarget}
          existingShares={subShares.shares}
          onClose={() => setSubShareTarget(null)}
          onSaved={subShares.refresh}
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
    </div>
  );
};
