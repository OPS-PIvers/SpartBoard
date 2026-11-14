import React from 'react';
import { Modal } from '@/components/common/Modal';

interface Props {
  kindLabel: string;
  title: string;
  sharer: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ShareImportConfirmModal: React.FC<Props> = ({
  kindLabel,
  title,
  sharer,
  onConfirm,
  onCancel,
}) => (
  <Modal
    isOpen
    onClose={onCancel}
    ariaLabel={`Import shared ${kindLabel}?`}
    maxWidth="max-w-md"
    contentClassName=""
    customHeader={
      <div className="px-5 pt-5 pb-3 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900">
          Import shared {kindLabel}?
        </h2>
      </div>
    }
  >
    <div className="px-5 pb-5 pt-4 space-y-3 text-sm text-slate-700">
      <p>
        <span className="font-semibold">{title}</span>
      </p>
      <p>
        Shared by: <span className="font-semibold">{sharer}</span>
      </p>
      <p className="text-xs text-slate-500">
        Only import content from people you trust. Nothing is added to your
        library until you confirm.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white hover:bg-brand-blue-dark"
        >
          Import
        </button>
      </div>
    </div>
  </Modal>
);
