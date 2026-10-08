import React from 'react';
import { Modal } from '@/components/common/Modal';
import type { LibraryDeleteConfirmCopy } from './libraryDeleteConfirmCopy';

export const LibraryDeleteConfirmDialog: React.FC<{
  copy: LibraryDeleteConfirmCopy;
  onSettle: (confirmed: boolean) => void;
}> = ({ copy, onSettle }) => (
  <Modal
    isOpen
    onClose={() => onSettle(false)}
    title={copy.title}
    maxWidth="max-w-md"
    zIndex="z-modal-deep"
    captureEscape
    contentClassName="px-6 pb-5"
    footerClassName="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"
    footer={
      <>
        <button
          type="button"
          autoFocus
          onClick={() => onSettle(false)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSettle(true)}
          className="rounded-xl bg-brand-red-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-red-dark"
        >
          {copy.confirmLabel}
        </button>
      </>
    }
  >
    <p className="text-sm leading-relaxed text-slate-600">{copy.message}</p>
  </Modal>
);
