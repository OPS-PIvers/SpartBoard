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

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LibraryGridLockContext } from './LibraryGridLockContext';
import type { FolderDropData } from './folderDropTargets';

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
  children: React.ReactNode;
}

export const LibraryDndContext: React.FC<LibraryDndContextProps> = ({
  itemIds,
  onReorder,
  onDropOnFolder,
  renderOverlay,
  children,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const overData = over.data.current as FolderDropData | undefined;
    if (overData && overData.type === 'folder') {
      if (onDropOnFolder) {
        void Promise.resolve(
          onDropOnFolder(String(active.id), overData.folderId)
        );
      }
      return;
    }

    if (active.id === over.id) return;
    if (!onReorder) return;

    const oldIndex = itemIds.indexOf(String(active.id));
    const newIndex = itemIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const next = [...itemIds];
    const [moved] = next.splice(oldIndex, 1);
    if (moved === undefined) return;
    next.splice(newIndex, 0, moved);

    void Promise.resolve(onReorder(next));
  };

  const handleDragCancel = (): void => {
    setActiveId(null);
  };

  const overlayLockState = useMemo(
    () => ({ locked: false, reason: undefined, dragDisabled: true }),
    []
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay>
        {activeId != null && renderOverlay ? (
          <LibraryGridLockContext.Provider value={overlayLockState}>
            {renderOverlay(activeId)}
          </LibraryGridLockContext.Provider>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default LibraryDndContext;
