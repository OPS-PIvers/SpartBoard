import { useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import type { TourAnchorId } from '@/config/tourAnchors';

const undoTourId = 'gradebook.undo-toast.undo' satisfies TourAnchorId;

export interface UndoEntry {
  run: () => Promise<void>;
}

/** Autosave feedback on the app toast: one toast at a time with Undo. */
export function useUndoToast(scope: string) {
  const { addToast } = useDashboard();
  const stack = useRef<UndoEntry[]>([]);
  const replaceKey = `undo-toast:${scope}`;

  const notify = (message: string, undo?: UndoEntry) => {
    if (undo) stack.current = [...stack.current.slice(-39), undo];
    addToast(
      message,
      'info',
      undo
        ? {
            label: 'Undo',
            onClick: () => {
              const u = stack.current.pop();
              if (u) void u.run().catch(fail);
            },
            tourId: undoTourId,
          }
        : undefined,
      { replaceKey }
    );
  };
  const fail = (err: unknown) => {
    console.error(`[${scope}]`, err);
    addToast(
      'Could not save. Check your connection and try again.',
      'error',
      undefined,
      { replaceKey }
    );
  };

  return { notify, fail };
}
