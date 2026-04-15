import React, { useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import { Modal } from './Modal';
import { useDialog } from '@/context/useDialog';

interface EditorModalShellProps {
  isOpen: boolean;
  title: string;
  subtitle?: React.ReactNode;
  isDirty: boolean;
  isSaving?: boolean;
  saveLabel?: string;
  saveDisabled?: boolean;
  footerExtras?: React.ReactNode;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  confirmDiscardMessage?: string;
  confirmDiscardTitle?: string;
  maxWidth?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared shell for full-screen editor modals (Quiz, Video Activity,
 * Guided Learning, MiniApp, etc.).
 *
 * Provides consistent chrome: sticky header with title + close, scrollable
 * body, sticky footer with Cancel + Save, and a dirty-state guard that
 * prompts before discarding unsaved changes.
 *
 * Parent owns draft state and `isDirty` computation; the shell just handles
 * presentation, the close-confirm flow, and the saving spinner.
 */
export const EditorModalShell: React.FC<EditorModalShellProps> = ({
  isOpen,
  title,
  subtitle,
  isDirty,
  isSaving = false,
  saveLabel = 'Save',
  saveDisabled = false,
  footerExtras,
  onSave,
  onClose,
  confirmDiscardMessage = 'You have unsaved changes. Discard them?',
  confirmDiscardTitle = 'Discard changes?',
  maxWidth = 'max-w-5xl',
  className = 'h-[85vh]',
  bodyClassName = 'px-6 py-5',
  children,
}) => {
  const { showConfirm } = useDialog();

  const requestClose = useCallback(async () => {
    if (isSaving) return;
    if (!isDirty) {
      onClose();
      return;
    }
    const ok = await showConfirm(confirmDiscardMessage, {
      title: confirmDiscardTitle,
      variant: 'warning',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    });
    if (ok) onClose();
  }, [
    isDirty,
    isSaving,
    onClose,
    showConfirm,
    confirmDiscardMessage,
    confirmDiscardTitle,
  ]);

  const handleSave = useCallback(async () => {
    if (saveDisabled || isSaving) return;
    try {
      await onSave();
    } catch (error) {
      console.error('Failed to save editor modal changes.', error);
    }
  }, [saveDisabled, isSaving, onSave]);

  const customHeader = (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
      <div className="flex flex-col min-w-0">
        <h3
          id="editor-modal-shell-title"
          className="font-black text-lg text-slate-800 truncate"
        >
          {title}
        </h3>
        {subtitle !== undefined && subtitle !== null && (
          <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
        )}
      </div>
      <button
        onClick={() => void requestClose()}
        className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors shrink-0"
        aria-label="Close"
      >
        <X size={20} />
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-3 px-6 py-3 bg-white">
      <div className="flex items-center gap-2">{footerExtras}</div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void requestClose()}
          className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saveDisabled || isSaving}
          className="flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saveLabel}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => void requestClose()}
      customHeader={customHeader}
      footer={footer}
      footerClassName="shrink-0 border-t border-slate-200"
      maxWidth={maxWidth}
      className={className}
      contentClassName={bodyClassName}
      ariaLabelledby="editor-modal-shell-title"
    >
      {children}
    </Modal>
  );
};
