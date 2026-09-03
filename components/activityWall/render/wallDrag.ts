import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { ActivityWallSubmission } from '@/types';
import type { WallMovePatch } from './types';

/** Pointer + keyboard sensors so every wall DndContext is operable without a mouse. */
export const useWallSensors = () =>
  useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

export const UNSORTED_ID = '__unsorted';

/** Move patch for a card dropped on a column; `null` clears the section. */
export const columnsDropPatch = (event: DragEndEvent): WallMovePatch | null => {
  const target = event.over?.id;
  if (typeof target !== 'string') return null;
  return { sectionId: target === UNSORTED_ID ? null : target };
};

/** Move patch for a card dropped on a table cell; `null` clears the placement. */
export const tableDropPatch = (event: DragEndEvent): WallMovePatch | null => {
  const target = event.over?.id;
  if (typeof target !== 'string') return null;
  return { cellKey: target === UNSORTED_ID ? null : target };
};

const orderValue = (submission: ActivityWallSubmission): number =>
  typeof submission.order === 'number'
    ? submission.order
    : submission.submittedAt;

/** Midpoint between the neighbours the card lands between; keeps `order` a float. */
export const orderForIndex = (
  items: ActivityWallSubmission[],
  fromIndex: number,
  toIndex: number
): number => {
  const without = items.filter((_, index) => index !== fromIndex);
  const before = without[toIndex - 1];
  const after = without[toIndex];
  if (!before && !after) return 0;
  if (!before) return orderValue(after) - 1;
  if (!after) return orderValue(before) + 1;
  return (orderValue(before) + orderValue(after)) / 2;
};

/** Move patch for a reordered timeline card, or null when the drop is a no-op. */
export const timelineDropPatch = (
  items: ActivityWallSubmission[],
  event: DragEndEvent
): WallMovePatch | null => {
  if (!event.over) return null;
  const fromIndex = items.findIndex((item) => item.id === event.active.id);
  const toIndex = items.findIndex((item) => item.id === event.over?.id);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
  return { order: orderForIndex(items, fromIndex, toIndex) };
};
