import React, { createContext, useCallback, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DialogVariant = 'info' | 'warning' | 'error' | 'success' | 'danger';

export interface AlertOptions {
  title?: string;
  variant?: DialogVariant;
}

export interface ConfirmOptions {
  title?: string;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptOptions {
  title?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

// Internal queued dialog states
interface AlertState {
  kind: 'alert';
  message: string;
  options: AlertOptions;
  resolve: () => void;
}

interface ConfirmState {
  kind: 'confirm';
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface PromptState {
  kind: 'prompt';
  message: string;
  options: PromptOptions;
  resolve: (value: string | null) => void;
}

export type DialogState = AlertState | ConfirmState | PromptState;

// ─── Context ──────────────────────────────────────────────────────────────────

export interface DialogContextValue {
  currentDialog: DialogState | null;
  showAlert: (message: string, options?: AlertOptions) => Promise<void>;
  showConfirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  showPrompt: (
    message: string,
    options?: PromptOptions
  ) => Promise<string | null>;
}

export const DialogContext = createContext<DialogContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentDialog, setCurrentDialog] = useState<DialogState | null>(null);
  // Queue for dialogs requested while one is already showing
  const queue = useRef<DialogState[]>([]);

  const openNext = useCallback(() => {
    const next = queue.current.shift();
    setCurrentDialog(next ?? null);
  }, []);

  const enqueue = useCallback(
    (dialog: DialogState) => {
      if (currentDialog === null && queue.current.length === 0) {
        setCurrentDialog(dialog);
      } else {
        queue.current.push(dialog);
      }
    },
    [currentDialog]
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
