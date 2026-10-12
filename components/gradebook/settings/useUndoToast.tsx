import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tourAttr } from '@/config/tourAnchors';

export interface UndoEntry {
  run: () => Promise<void>;
}

interface ToastState {
  id: number;
  message: string;
  canUndo: boolean;
}

/** Autosave feedback: one toast at a time with Undo, as the gradebook settings modal shows it. */
export function useUndoToast(scope: string) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const stack = useRef<UndoEntry[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const notify = (message: string, undo?: UndoEntry) => {
    if (undo) stack.current = [...stack.current.slice(-39), undo];
    seq.current += 1;
    setToast({ id: seq.current, message, canUndo: !!undo });
  };
  const fail = (err: unknown) => {
    console.error(`[${scope}]`, err);
    notify('Could not save. Check your connection and try again.');
  };
  const undo = () => {
    const u = stack.current.pop();
    setToast(null);
    if (u) void u.run().catch(fail);
  };

  const node = toast
    ? createPortal(
        <div
          key={toast.id}
          role="status"
          className="fixed bottom-6 left-1/2 z-toast flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3.5 rounded-lg bg-brand-blue-dark px-4 py-2.5 text-[13px] text-white shadow-lg font-sans"
        >
          <span>{toast.message}</span>
          {toast.canUndo && (
            <button
              type="button"
              {...tourAttr('gradebook.undo-toast.undo')}
              className="font-bold underline"
              onClick={undo}
            >
              Undo
            </button>
          )}
        </div>,
        document.body
      )
    : null;

  return { notify, fail, toastNode: node };
}
