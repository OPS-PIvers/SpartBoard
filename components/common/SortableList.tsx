import React, { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  SortingStrategy,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface SortableListDragHandleProps {
  /**
   * Spread on the handle element. Combines @dnd-kit's `attributes` and
   * `listeners` so a single spread enables drag + keyboard reordering.
   */
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: Record<string, (event: Event) => void> | undefined;
  /**
   * True when this item is currently being dragged. Useful for styling the
   * source row (opacity, ring, etc.).
   */
  isDragging: boolean;
}

interface SortableListProps<T> {
  items: T[];
  /** Pull a stable id off an item. Required by @dnd-kit. */
  getId: (item: T) => string;
  /**
   * Called with the reordered items array after a successful drag. The
   * second argument is the id of the item the user moved, so consumers can
   * highlight that specific row (instead of guessing) when they care.
   */
  onReorder: (next: T[], movedId: string) => void;
  /**
   * Render the row content. Spread `dragHandle.attributes` and
   * `dragHandle.listeners` on whichever element should act as the drag grip.
   * `index` is the item's position in `items`, provided so rows don't need
   * their own O(n) index lookups.
   */
  renderItem: (
    item: T,
    dragHandle: SortableListDragHandleProps,
    index: number
  ) => React.ReactNode;
  /** Optional className for the outer list container. */
  className?: string;
  /**
   * Layout strategy passed to dnd-kit's `SortableContext`. Defaults to
   * `'vertical'`. Use `'grid'` for wrap-flow / pill-strip layouts so
   * hit-testing computes neighbor zones in 2D instead of along the Y axis.
   */
  layout?: 'vertical' | 'grid';
}

const STRATEGY_BY_LAYOUT: Record<'vertical' | 'grid', SortingStrategy> = {
  vertical: verticalListSortingStrategy,
  grid: rectSortingStrategy,
};

// Hoisted sensor options so `useSensor` / `useSensors` (which memoize on the
// options object identity) return stable descriptors across renders instead
// of re-initializing the sensor pipeline on every list re-render.
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 8 } };
const KEYBOARD_SENSOR_OPTIONS = {
  coordinateGetter: sortableKeyboardCoordinates,
};

interface SortableRowProps {
  id: string;
  children: (handle: SortableListDragHandleProps) => React.ReactNode;
}

const SortableRow: React.FC<SortableRowProps> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({
        attributes: attributes as React.HTMLAttributes<HTMLElement>,
        listeners: listeners as
          | Record<string, (event: Event) => void>
          | undefined,
        isDragging,
      })}
    </div>
  );
};

/**
 * Generic vertical drag-reorder list built on `@dnd-kit/sortable`.
 *
 * Consumers control the row markup; this component owns the DnD plumbing —
 * `DndContext`, sensors (pointer + keyboard), `SortableContext`, transform
 * application, and `arrayMove` on drop.
 *
 * Reorder happens by id, so adding/removing items between renders is safe.
 * Pointer drags require an 8px movement before activating, which keeps clicks
 * on row content (selecting a question, etc.) from being eaten by the drag
 * sensor.
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
  layout = 'vertical',
}: SortableListProps<T>): React.ReactElement {
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS)
  );

  const ids = useMemo(() => items.map(getId), [items, getId]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex), String(active.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={STRATEGY_BY_LAYOUT[layout]}>
        <div className={className}>
          {items.map((item, index) => {
            const id = ids[index];
            return (
              <SortableRow key={id} id={id}>
                {(handle) => renderItem(item, handle, index)}
              </SortableRow>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
