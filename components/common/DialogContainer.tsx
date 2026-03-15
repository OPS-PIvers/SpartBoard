import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  X,
} from 'lucide-react';
import { useDialog } from '@/context/useDialog';
import { DialogVariant } from '@/context/DialogContextValue';

// ─── Variant config ───────────────────────────────────────────────────────────

interface VariantConfig {
  icon: React.ReactNode;
  iconBg: string;
  confirmBg: string;
  confirmHover: string;
  confirmText: string;
  borderAccent: string;
}

const getVariantConfig = (variant: DialogVariant = 'info'): VariantConfig => {
  switch (variant) {
    case 'error':
      return {
        icon: <AlertCircle className="w-6 h-6 text-red-400" />,
        iconBg: 'bg-red-500/15',
        confirmBg: 'bg-red-600',
        confirmHover: 'hover:bg-red-500',
        confirmText: 'text-white',
        borderAccent: 'border-red-500/30',
      };
    case 'danger':
      return {
        icon: <AlertTriangle className="w-6 h-6 text-orange-400" />,
        iconBg: 'bg-orange-500/15',
        confirmBg: 'bg-red-600',
        confirmHover: 'hover:bg-red-500',
        confirmText: 'text-white',
        borderAccent: 'border-orange-500/30',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="w-6 h-6 text-yellow-400" />,
        iconBg: 'bg-yellow-500/15',
        confirmBg: 'bg-yellow-600',
        confirmHover: 'hover:bg-yellow-500',
        confirmText: 'text-white',
        borderAccent: 'border-yellow-500/30',
      };
    case 'success':
      return {
        icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
        iconBg: 'bg-emerald-500/15',
        confirmBg: 'bg-emerald-600',
        confirmHover: 'hover:bg-emerald-500',
        confirmText: 'text-white',
        borderAccent: 'border-emerald-500/30',
      };
    case 'info':
    default:
      return {
        icon: <Info className="w-6 h-6 text-blue-400" />,
        iconBg: 'bg-blue-500/15',
        confirmBg: 'bg-brand-blue-primary',
        confirmHover: 'hover:bg-brand-blue-light',
        confirmText: 'text-white',
        borderAccent: 'border-blue-500/30',
      };
  }
};

const getConfirmVariantConfig = (
  variant: DialogVariant = 'info'
): VariantConfig => {
  // For confirm dialogs, the default icon is a question mark
  const base = getVariantConfig(variant);
  if (variant === 'info') {
    return {
      ...base,
      icon: <HelpCircle className="w-6 h-6 text-blue-400" />,
    };
  }
  return base;
};

// ─── Shared dialog shell ──────────────────────────────────────────────────────

interface DialogShellProps {
  variant: DialogVariant;
  title: string;
  message: string;
  isConfirm?: boolean;
  children: React.ReactNode; // button row
}

const DialogShell: React.FC<DialogShellProps> = ({
  variant,
  title,
  message,
  isConfirm = false,
  children,
}) => {
  const cfg = isConfirm
    ? getConfirmVariantConfig(variant)
    : getVariantConfig(variant);
  const titleId = React.useId();
  const descriptionId = React.useId();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`bg-slate-800 border ${cfg.borderAccent} rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in zoom-in-95 duration-200`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${cfg.iconBg}`}
        >
          {cfg.icon}
        </div>
        <h3
          id={titleId}
          className="font-bold text-base text-white leading-snug"
        >
          {title}
        </h3>
      </div>

      {/* Message */}
      <p
        id={descriptionId}
        className="px-5 pb-5 text-sm text-slate-300 leading-relaxed"
      >
        {message}
      </p>

      {/* Button row */}
      <div className="flex gap-2 px-5 pb-5 justify-end">{children}</div>
    </div>
  );
};

// ─── Alert Dialog ─────────────────────────────────────────────────────────────

const AlertDialog: React.FC<{
  message: string;
  title: string;
  variant: DialogVariant;
  onOk: () => void;
}> = ({ message, title, variant, onOk }) => {
  const cfg = getVariantConfig(variant);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onOk();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () =>
      window.removeEventListener('keydown', handler, { capture: true });
  }, [onOk]);

  return (
    <DialogShell variant={variant} title={title} message={message}>
      <button
        autoFocus
        onClick={onOk}
        className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${cfg.confirmBg} ${cfg.confirmHover} ${cfg.confirmText}`}
      >
        OK
      </button>
    </DialogShell>
  );
};

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

const ConfirmDialog: React.FC<{
  message: string;
  title: string;
  variant: DialogVariant;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  message,
  title,
  variant,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const cfg = getConfirmVariantConfig(variant);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () =>
      window.removeEventListener('keydown', handler, { capture: true });
  }, [onConfirm, onCancel]);

  return (
    <DialogShell variant={variant} title={title} message={message} isConfirm>
      <button
        onClick={onCancel}
        className="px-5 py-2 rounded-xl text-sm font-semibold transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
      >
        {cancelLabel}
      </button>
      <button
        autoFocus
        onClick={onConfirm}
        className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${cfg.confirmBg} ${cfg.confirmHover} ${cfg.confirmText}`}
      >
        {confirmLabel}
      </button>
    </DialogShell>
  );
};

// ─── Prompt Dialog ────────────────────────────────────────────────────────────

const PromptDialog: React.FC<{
  message: string;
  title: string;
  variant: DialogVariant;
  placeholder: string;
  defaultValue: string;
  multiline: boolean;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}> = ({
  message,
  title,
  variant,
  placeholder,
  defaultValue,
  multiline,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const cfg = getVariantConfig(variant);
  const titleId = React.useId();
  const descriptionId = React.useId();

  useEffect(() => {
    // Focus and select all on mount
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCancel();
      } else if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onConfirm(value);
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () =>
      window.removeEventListener('keydown', handler, { capture: true });
  }, [onConfirm, onCancel, value, multiline]);

  const handleSubmit = () => {
    onConfirm(value);
  };

  const inputClass =
    'w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 transition-colors resize-none';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="bg-slate-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 id={titleId} className="font-bold text-base text-white">
          {title}
        </h3>
        <button
          onClick={onCancel}
          className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Message + input */}
      <div className="px-5 pb-5 flex flex-col gap-3">
        {message && (
          <p
            id={descriptionId}
            className="text-sm text-slate-300 leading-relaxed"
          >
            {message}
          </p>
        )}
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            rows={5}
            className={inputClass}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
          />
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 px-5 pb-5 justify-end">
        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-xl text-sm font-semibold transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleSubmit}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${cfg.confirmBg} ${cfg.confirmHover} ${cfg.confirmText}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
};

// ─── Scroll lock (mirrors Modal.tsx pattern) ──────────────────────────────────

let dialogScrollLockCount = 0;

const lockBodyScroll = () => {
  if (dialogScrollLockCount === 0) {
    document.body.style.overflow = 'hidden';
  }
  dialogScrollLockCount += 1;
};

const unlockBodyScroll = () => {
  if (dialogScrollLockCount === 0) return;
  dialogScrollLockCount -= 1;
  if (dialogScrollLockCount === 0) {
    document.body.style.overflow = 'unset';
  }
};

// ─── DialogContainer ──────────────────────────────────────────────────────────

export const DialogContainer: React.FC = () => {
  const { currentDialog } = useDialog();

  useEffect(() => {
    if (!currentDialog) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [currentDialog]);

  if (!currentDialog || typeof document === 'undefined') return null;

  const renderDialog = () => {
    switch (currentDialog.kind) {
      case 'alert': {
        const { message, options, resolve } = currentDialog;
        const variant = options.variant ?? 'info';
        const title =
          options.title ??
          (variant === 'error'
            ? 'Error'
            : variant === 'warning'
              ? 'Warning'
              : variant === 'success'
                ? 'Success'
                : 'Notice');
        return (
          <AlertDialog
            message={message}
            title={title}
            variant={variant}
            onOk={resolve}
          />
        );
      }

      case 'confirm': {
        const { message, options, resolve } = currentDialog;
        const variant = options.variant ?? 'info';
        const title = options.title ?? 'Are you sure?';
        return (
          <ConfirmDialog
            message={message}
            title={title}
            variant={variant}
            confirmLabel={options.confirmLabel ?? 'Confirm'}
            cancelLabel={options.cancelLabel ?? 'Cancel'}
            onConfirm={() => resolve(true)}
            onCancel={() => resolve(false)}
          />
        );
      }

      case 'prompt': {
        const { message, options, resolve } = currentDialog;
        const title = options.title ?? 'Enter a value';
        const variant = options.variant ?? 'info';
        return (
          <PromptDialog
            message={message}
            title={title}
            variant={variant}
            placeholder={options.placeholder ?? ''}
            defaultValue={options.defaultValue ?? ''}
            multiline={options.multiline ?? false}
            confirmLabel={options.confirmLabel ?? 'Submit'}
            cancelLabel={options.cancelLabel ?? 'Cancel'}
            onConfirm={(value) => resolve(value)}
            onCancel={() => resolve(null)}
          />
        );
      }

      default:
        return null;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        // Clicking the backdrop dismisses alerts, cancels confirms/prompts
        if (currentDialog.kind === 'alert') {
          currentDialog.resolve();
        } else if (currentDialog.kind === 'confirm') {
          currentDialog.resolve(false);
        } else if (currentDialog.kind === 'prompt') {
          currentDialog.resolve(null);
        }
      }}
    >
      {renderDialog()}
    </div>,
    document.body
  );
};
