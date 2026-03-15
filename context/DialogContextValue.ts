import { createContext } from 'react';

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
  variant?: DialogVariant;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

// Internal queued dialog states
export interface AlertState {
  kind: 'alert';
  message: string;
  options: AlertOptions;
  resolve: () => void;
}

export interface ConfirmState {
  kind: 'confirm';
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export interface PromptState {
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
