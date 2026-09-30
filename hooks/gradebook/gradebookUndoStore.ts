import { useSyncExternalStore } from 'react';
import type { GradebookMark } from '@/utils/gradebook/gradebookCore';

export interface UndoMarkSnapshot {
  markId: string;
  /** The whole mark before the change; null when it did not exist. */
  before: GradebookMark | null;
  /** The mark as written, used to seed the restore. */
  after: GradebookMark;
}

export interface UndoEntry {
  batchId: string;
  label: string;
  marks: UndoMarkSnapshot[];
}

const MAX_ENTRIES = 30;
let stack: UndoEntry[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export const gradebookUndoStore = {
  push: (entry: UndoEntry): void => {
    stack = [...stack.slice(-(MAX_ENTRIES - 1)), entry];
    emit();
  },
  take: (batchId?: string): UndoEntry | null => {
    const idx =
      batchId === undefined
        ? stack.length - 1
        : stack.findIndex((e) => e.batchId === batchId);
    if (idx < 0) return null;
    const entry = stack[idx];
    stack = stack.filter((_, i) => i !== idx);
    emit();
    return entry;
  },
  peek: (): UndoEntry | null => {
    return stack.length ? stack[stack.length - 1] : null;
  },
  clear: (): void => {
    stack = [];
    emit();
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The newest undoable change, for an Undo button or Ctrl+Z hint. */
export function useLastUndo(): UndoEntry | null {
  return useSyncExternalStore(
    gradebookUndoStore.subscribe,
    gradebookUndoStore.peek,
    gradebookUndoStore.peek
  );
}
