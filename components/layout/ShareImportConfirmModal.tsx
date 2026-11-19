import React from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';

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
      <div className="px-5 py-3.5 bg-brand-blue-primary text-white rounded-t-2xl">
        <h2 className="text-base font-bold text-white">
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
        Only import content from people you trust.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        {/* no-tour-anchor: transient deep-link import confirmation, not a tourable surface */}
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          className="min-h-11"
        >
          Cancel
        </Button>
        {/* no-tour-anchor: transient deep-link import confirmation, not a tourable surface */}
        <Button
          type="button"
          variant="primary"
          onClick={onConfirm}
          className="min-h-11"
        >
          Import
        </Button>
      </div>
    </div>
  </Modal>
);
