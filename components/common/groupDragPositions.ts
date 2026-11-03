import { useSyncExternalStore } from 'react';

// Live positions of the widgets in a group drag, which move outside React until the drop.
type DragPositions = ReadonlyMap<string, { x: number; y: number }>;

let positions: DragPositions | null = null;
const listeners = new Set<() => void>();

export function setGroupDragPositions(next: DragPositions | null): void {
  if (next === positions) return;
  positions = next;
  for (const fn of listeners) fn();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getPositions = () => positions;

export const useGroupDragPositions = (): DragPositions | null =>
  useSyncExternalStore(subscribe, getPositions, getPositions);
