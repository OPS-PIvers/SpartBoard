import { useCallback, useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';
import { placeRelative } from '@/utils/reorderIds';
import { siblingCollections, type DropIndicator } from './dropIndicator';

type DndSurface = 'grid' | 'tree' | 'root';

interface ParsedDndId {
  kind: 'board' | 'collection';
  id: string;
  surface: DndSurface;
}

/** Drag/drop ids: 'board:<id>' and 'collection:<id>' (grid cards), 'tree:<id>' (sidebar), 'collection:root'. */
export const parseDndId = (raw: UniqueIdentifier): ParsedDndId => {
  const value = String(raw);
  const sep = value.indexOf(':');
  const prefix = value.slice(0, sep);
  const id = value.slice(sep + 1);
  if (prefix === 'board') return { kind: 'board', id, surface: 'grid' };
  if (prefix === 'tree') return { kind: 'collection', id, surface: 'tree' };
  return {
    kind: 'collection',
    id,
    surface: id === 'root' ? 'root' : 'grid',
  };
};

interface CollisionGeometry {
  pointer: { x: number; y: number } | null;
  rect: { left: number; top: number; width: number; height: number } | null;
}

// Share of a Collection target, from each edge, that reorders instead of dropping inside.
const EDGE_ZONE = 0.25;
// Pointer distance from a grid card that still counts as its gap.
const GAP_REACH = 16;

const withGeometry = (
  collision: Collision,
  geometry: CollisionGeometry
): Collision => ({ ...collision, data: { ...collision.data, ...geometry } });

// Pointer-first so the sidebar tree and grid never compete; gaps snap to the nearest same-kind card.
const collisionDetection: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  if (!pointer) return closestCenter(args);
  const rectOf = (id: UniqueIdentifier) => args.droppableRects.get(id) ?? null;

  const within = pointerWithin(args);
  if (within.length > 0) {
    return within.map((c) => withGeometry(c, { pointer, rect: rectOf(c.id) }));
  }

  const activeKind = parseDndId(args.active.id).kind;
  let nearest: { id: UniqueIdentifier; distance: number } | null = null;
  for (const container of args.droppableContainers) {
    const parsed = parseDndId(container.id);
    if (parsed.surface !== 'grid' || parsed.kind !== activeKind) continue;
    const rect = rectOf(container.id);
    if (!rect) continue;
    const dx = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right);
    const dy = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom);
    const distance = Math.hypot(dx, dy);
    if (distance <= GAP_REACH && (!nearest || distance < nearest.distance)) {
      nearest = { id: container.id, distance };
    }
  }
  return nearest
    ? [{ id: nearest.id, data: { pointer, rect: rectOf(nearest.id) } }]
    : [];
};

/** Where a drop would land: before/after a sibling, or inside a Collection. */
export const resolveDropTarget = (
  activeId: UniqueIdentifier,
  collision: Collision | undefined,
  parentOf: (collectionId: string) => string | null
): DropIndicator | null => {
  if (!collision) return null;
  const active = parseDndId(activeId);
  const over = parseDndId(collision.id);
  const overId = String(collision.id);
  const { pointer, rect } = (collision.data ??
    {}) as Partial<CollisionGeometry>;

  if (active.kind === 'board') {
    if (over.kind === 'collection') return { id: overId, mode: 'into' };
    if (over.id === active.id || !pointer || !rect) return null;
    return {
      id: overId,
      mode: pointer.x < rect.left + rect.width / 2 ? 'before' : 'after',
    };
  }

  if (over.kind === 'board') return null;
  if (over.surface === 'root') return { id: overId, mode: 'into' };
  if (over.id === active.id) return null;
  if (pointer && rect && parentOf(active.id) === parentOf(over.id)) {
    // Tree rows stack vertically; grid cards flow horizontally.
    const vertical = over.surface === 'tree';
    const pos = vertical ? pointer.y : pointer.x;
    const start = vertical ? rect.top : rect.left;
    const size = vertical ? rect.height : rect.width;
    if (pos < start + size * EDGE_ZONE) return { id: overId, mode: 'before' };
    if (pos > start + size * (1 - EDGE_ZONE)) {
      return { id: overId, mode: 'after' };
    }
  }
  return { id: overId, mode: 'into' };
};

const sameIndicator = (a: DropIndicator | null, b: DropIndicator | null) =>
  a?.id === b?.id && a?.mode === b?.mode;

interface UseBoardsModalDndOptions {
  /** Board ids the grid currently shows, in display order. */
  visibleBoardIds: string[];
}

export const useBoardsModalDnd = ({
  visibleBoardIds,
}: UseBoardsModalDndOptions) => {
  const {
    moveBoardToCollection,
    reorderDashboards,
    addToast,
    collectionsApi: { collections, moveCollection, reorderSiblings },
  } = useDashboard();
  const { t } = useTranslation();
  // e.g. 'board:abc' or 'collection:xyz' — drives the DragOverlay preview.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null
  );

  // Mouse: 15px movement to start drag. Touch: 350ms hold (matches BoardCard long-press).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 15 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 350, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const parentOf = useCallback(
    (collectionId: string) =>
      collections.find((c) => c.id === collectionId)?.parentCollectionId ??
      null,
    [collections]
  );

  const resolveDrop = useCallback(
    (activeId: UniqueIdentifier, collision: Collision | undefined) =>
      resolveDropTarget(activeId, collision, parentOf),
    [parentOf]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const next = resolveDrop(event.active.id, event.collisions?.[0]);
      setDropIndicator((prev) => (sameIndicator(prev, next) ? prev : next));
    },
    [resolveDrop]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    setDropIndicator(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const drop = resolveDrop(event.active.id, event.collisions?.[0]);
      setActiveDragId(null);
      setDropIndicator(null);
      if (!drop) return;
      const active = parseDndId(event.active.id);
      const over = parseDndId(drop.id);
      const destination = over.id === 'root' ? null : over.id;

      try {
        if (drop.mode === 'into') {
          if (active.kind === 'board') {
            await moveBoardToCollection(active.id, destination);
          } else {
            await moveCollection(active.id, destination);
          }
          return;
        }
        if (active.kind === 'board') {
          const next = placeRelative(
            visibleBoardIds,
            active.id,
            over.id,
            drop.mode
          );
          // reorderDashboards toasts and rolls back on failure.
          if (next) await reorderDashboards(next);
          return;
        }
        const parentId = parentOf(active.id);
        const next = placeRelative(
          siblingCollections(collections, parentId).map((c) => c.id),
          active.id,
          over.id,
          drop.mode
        );
        if (next) await reorderSiblings(parentId, next);
      } catch (err) {
        // Board moves toast themselves; Collection moves throw descriptive cycle errors worth showing.
        if (active.kind !== 'collection') return;
        const message =
          drop.mode === 'into' && err instanceof Error
            ? err.message
            : t('boardsModal.dndFailed', {
                defaultValue: 'Move failed — please retry',
              });
        addToast(message, 'error');
        logError('useBoardsModalDnd.collectionDrop', err, {
          activeId: active.id,
          overId: over.id,
          mode: drop.mode,
        });
      }
    },
    [
      resolveDrop,
      moveBoardToCollection,
      moveCollection,
      reorderDashboards,
      reorderSiblings,
      visibleBoardIds,
      parentOf,
      collections,
      addToast,
      t,
    ]
  );

  return {
    sensors,
    collisionDetection,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
    activeDragId,
    dropIndicator,
  };
};
