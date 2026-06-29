import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GlassCard } from '@/components/common/GlassCard';
import { GlobalStyle } from '@/types';

interface PromptDialogProps {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  globalStyle?: GlobalStyle;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  globalStyle,
}) => {
  const [value, setValue] = useState(defaultValue);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  // eslint-disable-next-line react-hooks/refs -- intentional render-body ref sync (CLAUDE.md pattern)
  onCancelRef.current = onCancel;

  const handleSubmit = () => {
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as Element | null;
      const ownedPortal = target?.closest('[data-widget-portal]');
      // Bail if Escape originates from a nested portal that is NOT this dialog.
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
      aria-labelledby="prompt-dialog-title"
      aria-describedby="prompt-dialog-message"
    >
      <GlassCard
        globalStyle={globalStyle}
        className="w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h3
          id="prompt-dialog-title"
          className="text-sm font-black uppercase tracking-widest text-slate-800 mb-3"
        >
          {title}
        </h3>
        <p
          id="prompt-dialog-message"
          className="text-sm text-slate-600 mb-4 font-medium"
        >
          {message}
        </p>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          rows={4}
          className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-brand-blue-primary text-sm font-medium mb-6 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
          aria-label={message}
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white bg-brand-blue-primary rounded-xl hover:bg-brand-blue-dark shadow-lg shadow-brand-blue-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </GlassCard>
    </div>,
    document.body
  );
};
