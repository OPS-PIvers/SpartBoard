/**
 * LibraryDndContext — shared `DndContext` scope for folder-aware libraries.
 *
 * Wave 3-B-3: sharing a single `DndContext` between the grid (sortable cards)
 * and the `FolderSidebar` (droppable folder nodes) is how we implement
 * drag-to-folder. `dnd-kit` does not bubble drop events between nested
 * `DndContext`s, so the grid must opt out of creating its own context
 * (`LibraryGrid.useExternalDndContext={true}`) and let this wrapper own both
 * sortable and droppable interactions.
 *
 * The wrapper is presentation-only — it takes the ordered list of sortable
 * item ids (so reorder drops can compute the new ordering) plus two
 * callbacks:
 *   - `onReorder`       fires when a card is dropped on another card.
 *   - `onDropOnFolder`  fires when a card is dropped on a folder node.
 *
 * Consumers supply `renderOverlay(activeId)` so the `DragOverlay` renders the
 * same card shape as in the grid. The overlay is wrapped in
 * `LibraryGridLockContext.Provider` so overlay cards render unlocked, matching
 * the internal-DndContext behavior of `LibraryGrid`.
 */

import { createPortal } from 'react-dom';
import { Z_INDEX } from '@/config/zIndex';
import React, {
  use,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { DashboardActionsContext } from '@/context/dashboardCanvasStore';
import { DashboardContext } from '@/context/DashboardContextValue';
import { logError } from '@/utils/logError';
import type { DeleteFolderMode, FolderDeleteUndo } from '@/hooks/useFolderTree';
import { LibraryGridLockContext } from './LibraryGridLockContext';
import {
  LibraryDragContext,
  type LibraryDragState,
} from './LibraryDragContext';
import type { LibraryFolderViewModel } from './LibraryFolderViewContext';
import { NEW_FOLDER_NAME } from './folderView';
import { acceptsItem, ownParentId } from './sourceFolders';
import { LIBRARY_ROOT_LABEL } from './FolderViewHeader';
import {
  folderAwareCollisionDetection,
  type FolderDropData,
  type ItemMergeDropData,
} from './folderDropTargets';

/** Hold time over the middle of a row before it becomes a "Create folder" target (D14). */
const MERGE_HOLD_MS = 500;

export interface LibraryDndFolderActions {
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  renameFolder: (folderId: string, nextName: string) => Promise<void>;
  deleteFolder: (
    folderId: string,
    mode: DeleteFolderMode
  ) => Promise<FolderDeleteUndo | undefined>;
}

export interface LibraryDndContextProps {
  /** Ordered list of draggable item ids in the grid. */
  itemIds: string[];
  /** Fires when a card is dropped on another card; receives the new order. */
  onReorder?: (nextOrderedIds: string[]) => Promise<void> | void;
  /** Fires when a card is dropped on a folder drop target. */
  onDropOnFolder?: (
    itemId: string,
    folderId: string | null
  ) => Promise<void> | void;
  /**
   * Render the dragged card inside `DragOverlay`. Return `null` if the active
   * id is not a sortable card (e.g. future sidebar-to-sidebar drags).
   */
  renderOverlay?: (activeId: string) => React.ReactNode;
  /** Folder view model; when set, turns on multi-item drag, hold-to-create, touch and Undo toasts. */
  folderView?: LibraryFolderViewModel | null;
  /** Current selection; dragging a selected item carries all of them (D13). */
  selectedIds?: ReadonlySet<string>;
  /** Needed for drag-to-create folders (D14). */
  folderActions?: LibraryDndFolderActions;
  children: React.ReactNode;
}

const countLabel = (n: number, noun: readonly [string, string]): string =>
  `${n} ${n === 1 ? noun[0] : noun[1]}`;

export const LibraryDndContext: React.FC<LibraryDndContextProps> = ({
  itemIds,
  onReorder,
  onDropOnFolder,
  renderOverlay,
  folderView = null,
  selectedIds,
  folderActions,
  children,
}) => {
  const enabled = folderView != null;
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  });
  // Press and hold on touch so a swipe still scrolls the list (D15).
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(
    ...(enabled
      ? [mouseSensor, touchSensor, keyboardSensor]
      : [pointerSensor, keyboardSensor])
  );

  const addToast =
    useContext(DashboardActionsContext)?.addToast ??
    use(DashboardContext)?.addToast;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [armedItemId, setArmedItemId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [overFolder, setOverFolder] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTarget = useRef<string | null>(null);

  const clearHold = useCallback((): void => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdTarget.current = null;
    setArmedItemId(null);
  }, []);

  const undoToast = useCallback(
    (message: string, undo: () => Promise<void>): void => {
      addToast?.(message, 'success', {
        label: 'Undo',
        onClick: () => {
          undo().catch((err: unknown) => {
            logError('LibraryDndContext.undo', err);
            addToast('Could not undo. Try again.', 'error');
          });
        },
      });
    },
    [addToast]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent): void => {
      const id = String(event.active.id);
      setActiveId(id);
      const group =
        enabled && selectedIds?.has(id) && selectedIds.size > 1
          ? itemIds.filter((i) => selectedIds.has(i))
          : [id];
      setDraggingIds(group);
    },
    [enabled, selectedIds, itemIds]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent): void => {
      if (!enabled) return;
      const data = event.over?.data.current as
        | FolderDropData
        | ItemMergeDropData
        | undefined;
      setOverFolder(data?.type === 'folder');
      const target =
        data?.type === 'item-merge' && !draggingIds.includes(data.itemId)
          ? data.itemId
          : null;
      if (target === holdTarget.current) return;
      clearHold();
      if (!target || !folderActions) return;
      holdTarget.current = target;
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        setArmedItemId(target);
      }, MERGE_HOLD_MS);
    },
    [enabled, draggingIds, folderActions, clearHold]
  );

  const moveToFolder = useCallback(
    async (ids: string[], folderId: string | null): Promise<void> => {
      if (!onDropOnFolder) return;
      if (!folderView) {
        for (const id of ids) await onDropOnFolder(id, folderId);
        return;
      }
      // A source folder takes back only its own shared items (D21).
      const moving = ids.filter(
        (id) =>
          folderView.folderIdOf(id) !== folderId && acceptsItem(folderId, id)
      );
      if (moving.length === 0) return;
      const previous = new Map(
        moving.map((id) => [id, folderView.folderIdOf(id)])
      );
      await Promise.all(moving.map(async (id) => onDropOnFolder(id, folderId)));
      const name =
        folderId == null
          ? LIBRARY_ROOT_LABEL
          : (folderView.index.byId.get(folderId)?.name ?? LIBRARY_ROOT_LABEL);
      undoToast(
        `Moved ${countLabel(moving.length, folderView.itemNoun)} to ${name}`,
        async () => {
          await Promise.all(
            moving.map(async (id) =>
              onDropOnFolder(id, previous.get(id) ?? null)
            )
          );
        }
      );
    },
    [onDropOnFolder, folderView, undoToast]
  );

  const createFolderWith = useCallback(
    async (targetId: string, group: string[]): Promise<void> => {
      if (!folderView || !folderActions || !onDropOnFolder) return;
      const ids = [targetId, ...group.filter((id) => id !== targetId)];
      const previous = new Map(
        ids.map((id) => [id, folderView.folderIdOf(id)])
      );
      let folderId: string;
      try {
        folderId = await folderActions.createFolder(
          NEW_FOLDER_NAME,
          ownParentId(folderView.folderIdOf(targetId))
        );
      } catch (err) {
        logError('LibraryDndContext.createFolder', err);
        addToast?.('Could not create the folder. Try again.', 'error');
        return;
      }
      await Promise.all(ids.map(async (id) => onDropOnFolder(id, folderId)));
      setRenamingFolderId(folderId);
      undoToast(
        `Created a folder with ${countLabel(ids.length, folderView.itemNoun)}`,
        async () => {
          await Promise.all(
            ids.map(async (id) => onDropOnFolder(id, previous.get(id) ?? null))
          );
          await folderActions.deleteFolder(folderId, 'move-to-parent');
        }
      );
    },
    [folderView, folderActions, onDropOnFolder, addToast, undoToast]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const armed = armedItemId;
      const group = draggingIds;
      clearHold();
      setOverFolder(false);
      setActiveId(null);
      setDraggingIds([]);
      const { active, over } = event;
      if (!over) return;

      const overData = over.data.current as
        | FolderDropData
        | ItemMergeDropData
        | undefined;
      const fail = (err: unknown): void => {
        logError('LibraryDndContext.drop', err);
        addToast?.('Could not move. Try again.', 'error');
      };
      if (overData?.type === 'folder') {
        moveToFolder(
          group.length > 0 ? group : [String(active.id)],
          overData.folderId
        ).catch(fail);
        return;
      }
      if (overData?.type === 'item-merge' && armed === overData.itemId) {
        createFolderWith(armed, group).catch(fail);
        return;
      }
      // A quick drop on the middle of a row still reorders onto that row.
      const overId =
        overData?.type === 'item-merge' ? overData.itemId : String(over.id);

      if (String(active.id) === overId) return;
      if (!onReorder || group.length > 1) return;

      const oldIndex = itemIds.indexOf(String(active.id));
      const newIndex = itemIds.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return;

      const next = [...itemIds];
      const [moved] = next.splice(oldIndex, 1);
      if (moved === undefined) return;
      next.splice(newIndex, 0, moved);

      void onReorder(next);
    },
    [
      armedItemId,
      draggingIds,
      clearHold,
      moveToFolder,
      createFolderWith,
      itemIds,
      onReorder,
      addToast,
    ]
  );

  const handleDragCancel = useCallback((): void => {
    clearHold();
    setOverFolder(false);
    setActiveId(null);
    setDraggingIds([]);
  }, [clearHold]);

  const finishRename = useCallback(
    (folderId: string, name: string | null): void => {
      setRenamingFolderId(null);
      const next = name?.trim();
      if (!next || next === NEW_FOLDER_NAME || !folderActions) return;
      folderActions.renameFolder(folderId, next).catch((err: unknown) => {
        logError('LibraryDndContext.rename', err);
        addToast?.('Could not rename the folder. Try again.', 'error');
      });
    },
    [folderActions, addToast]
  );

  const dragState = useMemo<LibraryDragState>(
    () => ({
      enabled,
      canCreateFolder: enabled && folderActions != null,
      draggingIds: new Set(draggingIds),
      armedItemId,
      renamingFolderId,
      finishRename,
    }),
    [
      enabled,
      folderActions,
      draggingIds,
      armedItemId,
      renamingFolderId,
      finishRename,
    ]
  );

  const overlayLockState = useMemo(
    () => ({ locked: false, reason: undefined, dragDisabled: true }),
    []
  );

  const overlay =
    activeId != null && renderOverlay ? renderOverlay(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={folderAwareCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <LibraryDragContext.Provider value={dragState}>
        {children}
      </LibraryDragContext.Provider>
      {/* Portaled: the widget's container-type makes it the containing block for fixed elements, which offset the overlay from the cursor. */}
      {createPortal(
        <DragOverlay zIndex={Z_INDEX.modalDeep}>
          {overlay ? (
            <LibraryGridLockContext.Provider value={overlayLockState}>
              {/* Hidden over a target so its "Move into" or "Create folder" label reads cleanly. */}
              <div
                className={`relative transition-opacity ${
                  overFolder || armedItemId ? 'opacity-0' : ''
                }`}
              >
                {overlay}
                {folderView && draggingIds.length > 1 && (
                  <span
                    className="absolute -right-2 -top-2 rounded-full bg-brand-blue-primary px-2.5 py-1 text-xs font-bold text-white shadow-md"
                    data-testid="library-drag-count"
                  >
                    {countLabel(draggingIds.length, folderView.itemNoun)}
                  </span>
                )}
              </div>
            </LibraryGridLockContext.Provider>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
};

export default LibraryDndContext;
