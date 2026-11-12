import React, { useState } from 'react';
import { Globe, X } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import type { ImportInboxItem } from '@/utils/import/contract';

interface ImportInboxNoticeProps {
  items: ImportInboxItem[];
  /** True while the Add to board window is open. */
  suppressed: boolean;
  onOpen: () => void;
  /** Discards the given Sends for good. */
  onDiscard: (ids: string[]) => void;
}

/** Corner notice for pages the extension sent that haven't been added yet. */
export const ImportInboxNotice: React.FC<ImportInboxNoticeProps> = ({
  items,
  suppressed,
  onOpen,
  onDiscard,
}) => {
  // Hides at once while the deletes reach Firestore; an id that left the list is forgotten, so a re-send shows again.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const stale = [...hidden].filter((id) => !items.some((i) => i.id === id));
  if (stale.length > 0)
    setHidden(new Set([...hidden].filter((id) => !stale.includes(id))));
  const waiting = items.filter((item) => !hidden.has(item.id));
  if (suppressed || waiting.length === 0) return null;
  const count = items.length;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 right-4 z-dock flex items-center gap-3 rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-2 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <Globe className="h-4 w-4 shrink-0 text-brand-blue-primary" aria-hidden />
      <span className="text-sm text-slate-700">
        {count === 1
          ? '1 page sent from your browser'
          : `${count} pages sent from your browser`}
      </span>
      <button
        type="button"
        onClick={onOpen}
        {...tourAttr('import-notice.open')}
        className="relative touch-target-expand rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue-dark"
      >
        Add to board
      </button>
      <button // no-tour-anchor: shows only after a Send, not on a tour path
        type="button"
        onClick={() => {
          const ids = items.map((item) => item.id);
          setHidden(new Set(ids));
          onDiscard(ids);
        }}
        aria-label="Discard"
        className="relative touch-target-expand rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
