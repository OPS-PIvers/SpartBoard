import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourAttr } from '@/config/tourAnchors';

interface PublishInProgressDialogProps {
  message: string;
  onConfirm: () => void;
  onEndAndPublish: () => void;
  onCancel: () => void;
}

// Asked before publishing an assignment students can still open.
export const PublishInProgressDialog: React.FC<
  PublishInProgressDialogProps
> = ({ message, onConfirm, onEndAndPublish, onCancel }) => (
  <Modal
    isOpen
    onClose={onCancel}
    ariaLabel="Assignment in progress"
    maxWidth="max-w-md"
    contentClassName=""
    customHeader={false}
  >
    <div className="px-5 pt-5 pb-5 flex flex-col items-center text-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
        <AlertTriangle aria-hidden className="w-5 h-5" />
      </div>
      <p className="text-sm text-slate-700">{message}</p>
      <div className="flex flex-wrap justify-center gap-2 whitespace-nowrap">
        <button
          type="button"
          onClick={onCancel}
          {...tourAttr('publish-in-progress.cancel')}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onEndAndPublish}
          {...tourAttr('publish-in-progress.end-and-publish')}
          className="rounded-lg border border-brand-blue-primary px-4 py-2 text-sm font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter/30 transition-colors"
        >
          End &amp; Publish Scores
        </button>
        <button
          type="button"
          onClick={onConfirm}
          {...tourAttr('publish-in-progress.confirm')}
          className="rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-blue-dark transition-colors"
        >
          Confirm
        </button>
      </div>
    </div>
  </Modal>
);
