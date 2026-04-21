/**
 * BulkActionBar — floating contextual bar shown above the grid when one or
 * more library items are selected. Surfaces count + Move-to-folder + Delete
 * + Clear. Rendered by each manager above its LibraryGrid so the shell
 * stays agnostic of selection state.
 */

import React, { useState } from 'react';
import { FolderInput, Trash2, X } from 'lucide-react';
import type { LibraryFolder } from '@/types';
import { FolderPickerPopover } from './FolderPickerPopover';

export interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  /** Folder picker data. When omitted, the "Move" button is hidden. */
  folders?: LibraryFolder[];
  onMove?: (folderId: string | null) => void | Promise<void>;
  /** Delete handler. When omitted, the "Delete" button is hidden. */
  onDelete?: () => void | Promise<void>;
  /** Optional busy flag that disables actions while a batch is in-flight. */
  busy?: boolean;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  count,
  onClear,
  folders,
  onMove,
  onDelete,
  busy,
}) => {
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-blue-primary/30 bg-brand-blue-lighter/30 px-3 py-2 shadow-sm backdrop-blur-sm"
    >
      <span className="font-bold text-sm text-brand-blue-dark">
        {count} selected
      </span>

      <div className="ml-auto flex items-center gap-2">
        {folders && onMove && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFolderPicker((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-blue-dark shadow-sm transition-colors hover:bg-brand-blue-lighter/40 disabled:cursor-not-allowed disabled:opacity-50"
              aria-haspopup="dialog"
              aria-expanded={showFolderPicker}
            >
              <FolderInput className="h-3.5 w-3.5" />
              Move
            </button>
            {showFolderPicker && (
              <FolderPickerPopover
                folders={folders}
                selectedFolderId={null}
                onSelect={async (folderId) => {
                  setShowFolderPicker(false);
                  await onMove(folderId);
                }}
                onClose={() => setShowFolderPicker(false)}
              />
            )}
          </div>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={async () => {
              if (!busy) await onDelete();
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-red-dark shadow-sm transition-colors hover:bg-brand-red-lighter/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}

        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
    </div>
  );
};
