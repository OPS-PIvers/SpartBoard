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
  /** Teacher and class the change belongs to, so another class or account never undoes it. */
  scope: string;
  at: number;
  batchId: string;
  label: string;
  marks: UndoMarkSnapshot[];
}

const MAX_ENTRIES = 30;
let stack: UndoEntry[] = [];

function lastIndex(match: (e: UndoEntry) => boolean): number {
  for (let i = stack.length - 1; i >= 0; i--) if (match(stack[i])) return i;
  return -1;
}
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export const gradebookUndoStore = {
  push: (entry: UndoEntry): void => {
    stack = [...stack.slice(-(MAX_ENTRIES - 1)), entry];
    emit();
  },
  take: (scope: string, batchId?: string): UndoEntry | null => {
    const idx = lastIndex(
      (e) =>
        e.scope === scope && (batchId === undefined || e.batchId === batchId)
    );
    if (idx < 0) return null;
    const entry = stack[idx];
    stack = stack.filter((_, i) => i !== idx);
    emit();
    return entry;
  },
  peek: (scope: string): UndoEntry | null => {
    const idx = lastIndex((e) => e.scope === scope);
    return idx < 0 ? null : stack[idx];
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
export function useLastUndo(scope: string): UndoEntry | null {
  const read = () => gradebookUndoStore.peek(scope);
  return useSyncExternalStore(gradebookUndoStore.subscribe, read, read);
}
