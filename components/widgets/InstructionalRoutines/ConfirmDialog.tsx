import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GlassCard } from '@/components/common/GlassCard';
import { GlobalStyle } from '@/types';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  globalStyle?: GlobalStyle;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  globalStyle,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  // eslint-disable-next-line react-hooks/refs -- intentional render-body ref sync (CLAUDE.md pattern)
  onCancelRef.current = onCancel;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as Element | null;
      const ownedPortal = target?.closest('[data-widget-portal]');
      // Bail if Escape originates from a nested portal that is NOT this dialog
      // (e.g. a ConfirmDialog stacked inside another ConfirmDialog).
      if (ownedPortal && ownedPortal !== dialogRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onCancelRef.current();
    };
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  return createPortal(
    <div
      ref={dialogRef}
      data-widget-portal=""
      className="fixed inset-0 z-critical flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <GlassCard
        globalStyle={globalStyle}
        className="w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h3
          id="confirm-dialog-title"
          className="text-sm font-black uppercase tracking-widest text-slate-800 mb-3"
        >
          {title}
        </h3>
        <p
          id="confirm-dialog-message"
          className="text-sm text-slate-600 mb-6 font-medium"
        >
          {message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            autoFocus
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white bg-brand-red-primary rounded-xl hover:bg-brand-red-dark shadow-lg shadow-brand-red-primary/20 transition-all"
          >
            {confirmLabel}
          </button>
        </div>
      </GlassCard>
    </div>,
    document.body
  );
};
