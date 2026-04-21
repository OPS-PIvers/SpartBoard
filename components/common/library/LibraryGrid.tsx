/**
 * LibraryGrid — dnd-kit `SortableContext` wrapper for the library surface.
 *
 * Presentational only: it does not own item state. Consumers pass their
 * (already-ordered) items and a `renderCard` callback, and the grid wires
 * up the `DndContext` + `SortableContext` + `DragOverlay` around them.
 *
 * Drag is auto-disabled when `dragDisabled === true`. When `reorderLocked`
 * is set (but drag isn't fully disabled), drag handles are rendered at
 * reduced opacity with an explanatory tooltip from `reorderLockedReason`
 * — this is surfaced to cards via `LibraryGridLockContext`.
 *
 * The grid renders `emptyState` in place of the list when `items.length === 0`.
 *
 * Wave 3-B-3 adds an opt-in `useExternalDndContext` mode. When true, the grid
 * renders only the `SortableContext` and defers `DndContext` + `DragOverlay`
 * ownership to the parent (typically `LibraryDndContext`). This is what the
 * folder-drag-drop flow uses to share a single DndContext across both the
 * grid and the `FolderSidebar` so that cards can be dropped on folders.
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
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import type { LibraryGridProps } from './types';
import { LibraryGridLockContext } from './LibraryGridLockContext';

interface LibraryGridExtraProps {
  /**
   * When true, the grid skips creating its own `DndContext` + `DragOverlay`
   * and relies on a parent `DndContext` (e.g. `LibraryDndContext`). In this
   * mode `onReorder` is ignored — the parent owns drag-end routing.
   */
  useExternalDndContext?: boolean;
}

export function LibraryGrid<TItem>(
  props: LibraryGridProps<TItem> & LibraryGridExtraProps
) {
  const {
    items,
    getId,
    renderCard,
    onReorder,
    dragDisabled = false,
    reorderLocked = false,
    reorderLockedReason,
    layout = 'grid',
    emptyState,
    useExternalDndContext = false,
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const ids = useMemo(() => items.map(getId), [items, getId]);
  const activeItem = useMemo(
    () =>
      activeId == null
        ? null
        : (items.find((i) => getId(i) === activeId) ?? null),
    [activeId, items, getId]
  );
  const activeIndex = useMemo(
    () => (activeItem == null ? -1 : items.indexOf(activeItem)),
    [activeItem, items]
  );

  const lockState = useMemo(
    () => ({
      locked: reorderLocked,
      reason: reorderLocked ? reorderLockedReason : undefined,
      dragDisabled,
    }),
    [reorderLocked, reorderLockedReason, dragDisabled]
  );

  if (items.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (!onReorder) return;

    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const next = [...ids];
    const [moved] = next.splice(oldIndex, 1);
    if (moved === undefined) return;
    next.splice(newIndex, 0, moved);

    void Promise.resolve(onReorder(next)).catch((err: unknown) => {
      console.error('[LibraryGrid] reorder failed', err);
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const isListLayout = layout === 'list';
  const strategy = isListLayout
    ? verticalListSortingStrategy
    : rectSortingStrategy;

  const containerClass = isListLayout ? 'flex flex-col gap-3' : 'gap-3';
  const containerStyle: React.CSSProperties | undefined = isListLayout
    ? undefined
    : {
        display: 'grid',
        gridTemplateColumns:
          'repeat(auto-fill, minmax(min(240px, 80cqmin), 1fr))',
      };

  if (useExternalDndContext) {
    return (
      <LibraryGridLockContext.Provider value={lockState}>
        <SortableContext items={ids} strategy={strategy}>
          <div
            className={containerClass}
            style={containerStyle}
            data-testid="library-grid"
          >
            {items.map((item, index) => renderCard(item, index))}
          </div>
        </SortableContext>
      </LibraryGridLockContext.Provider>
    );
  }

  return (
    <LibraryGridLockContext.Provider value={lockState}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={ids} strategy={strategy}>
          <div
            className={containerClass}
            style={containerStyle}
            data-testid="library-grid"
          >
            {items.map((item, index) => renderCard(item, index))}
          </div>
        </SortableContext>
        <DragOverlay modifiers={[snapCenterToCursor]}>
          {activeItem != null ? (
            <LibraryGridLockContext.Provider
              value={{ locked: false, reason: undefined, dragDisabled: true }}
            >
              {renderCard(activeItem, activeIndex)}
            </LibraryGridLockContext.Provider>
          ) : null}
        </DragOverlay>
      </DndContext>
    </LibraryGridLockContext.Provider>
  );
}
