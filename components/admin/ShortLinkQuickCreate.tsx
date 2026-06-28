import React from 'react';
import { X, Link2 } from 'lucide-react';

import { ShortLinkCreateForm } from './LinkShortenerManager';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';

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
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isEscapeFromWidgetInput(event)) return;
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-modal bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="short-link-quick-create-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4">
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
    </div>
  );
};
