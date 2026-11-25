import React from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { X, Link2 } from 'lucide-react';

import { ShortLinkCreateForm } from './LinkShortenerManager';
import { Modal } from '@/components/common/Modal';

interface ShortLinkQuickCreateProps {
  onClose: () => void;
}

/**
 * Lightweight modal opened from the Sidebar admin quick-action. Reuses the
 * create form from `LinkShortenerManager` so the field set, validation, and
 * Firestore write all stay in one place.
 */
export const ShortLinkQuickCreate: React.FC<ShortLinkQuickCreateProps> = ({
  onClose,
}) => {
  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="bare"
      maxWidth="max-w-lg"
      captureEscape
      ariaLabelledby="short-link-quick-create-title"
      className="rounded-2xl bg-white shadow-xl"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-brand-blue-lighter text-brand-blue-primary p-2 rounded-lg">
              <Link2 className="w-4 h-4" />
            </div>
            <h3
              id="short-link-quick-create-title"
              className="text-lg font-bold text-slate-800"
            >
              Shorten a URL
            </h3>
          </div>
          <button
            {...tourAttr('admin.links.modal-close')}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ShortLinkCreateForm compact />
      </div>
    </Modal>
  );
};
