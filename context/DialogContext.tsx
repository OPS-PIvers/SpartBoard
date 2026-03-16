import React, { useCallback, useRef, useState } from 'react';
import {
  DialogContext,
  DialogState,
  AlertOptions,
  ConfirmOptions,
  PromptOptions,
} from './DialogContextValue';

// ─── Provider ─────────────────────────────────────────────────────────────────

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentDialog, setCurrentDialog] = useState<DialogState | null>(null);
  // Queue of pending dialogs. Always push here first; processQueue promotes one at a time.
  const queue = useRef<DialogState[]>([]);
  // Ref flag prevents race: multiple enqueue() calls in the same tick
  // can't all see currentDialog===null and overwrite each other.
  const isShowingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (isShowingRef.current || queue.current.length === 0) return;
    const next = queue.current.shift();
    if (next) {
      isShowingRef.current = true;
      setCurrentDialog(next);
    }
  }, []);

  const openNext = useCallback(() => {
    isShowingRef.current = false;
    setCurrentDialog(null);
    processQueue();
  }, [processQueue]);

  const enqueue = useCallback(
    (dialog: DialogState) => {
      queue.current.push(dialog);
      processQueue();
    },
    [processQueue]
  );

  const showAlert = useCallback(
    (message: string, options: AlertOptions = {}): Promise<void> => {
      return new Promise<void>((resolve) => {
        enqueue({
          kind: 'alert',
          message,
          options,
          resolve: () => {
            resolve();
            openNext();
          },
        });
      });
    },
    [enqueue, openNext]
  );

  const showConfirm = useCallback(
    (message: string, options: ConfirmOptions = {}): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        enqueue({
          kind: 'confirm',
          message,
          options,
          resolve: (value: boolean) => {
            resolve(value);
            openNext();
          },
        });
      });
    },
    [enqueue, openNext]
  );

  const showPrompt = useCallback(
    (message: string, options: PromptOptions = {}): Promise<string | null> => {
      return new Promise<string | null>((resolve) => {
        enqueue({
          kind: 'prompt',
          message,
          options,
          resolve: (value: string | null) => {
            resolve(value);
            openNext();
          },
        });
      });
    },
    [enqueue, openNext]
  );

  return (
    <DialogContext.Provider
      value={{ currentDialog, showAlert, showConfirm, showPrompt }}
    >
      {children}
    </DialogContext.Provider>
  );
};
