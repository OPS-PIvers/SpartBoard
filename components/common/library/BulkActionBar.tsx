/**
 * BulkActionBar — floating contextual bar shown above the grid when one or
 * more library items are selected. Surfaces count + per-action buttons +
 * Clear. Rendered by each manager above its LibraryGrid so the shell stays
 * agnostic of selection state.
 *
 * v2 (Phase 4): the `actions: BulkAction[]` prop lets callers compose
 * arbitrary multi-action toolbars (delete, duplicate, move, archive,
 * etc.). The legacy `folders + onMove + onDelete` props remain supported
 * for back-compat — they're synthesized into actions internally.
 */

import React, { useState } from 'react';
import { FolderInput, Trash2, X, type LucideIcon } from 'lucide-react';
import type { LibraryFolder } from '@/types';
import { FolderPickerPopover } from './FolderPickerPopover';

/**
 * A single bulk action surfaced in the toolbar. The toolbar renders these
 * left-to-right between the count and the Clear button. Use `destructive`
 * for the danger styling that delete used to get exclusively.
 */
export interface BulkAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void | Promise<void>;
  destructive?: boolean;
  /** Disables this individual action (in addition to the toolbar-wide busy). */
  disabled?: boolean;
}

export interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  /**
   * v2 multi-action API. When provided, takes precedence over the legacy
   * folders/onMove/onDelete props; mixing both is allowed and they
   * concatenate (legacy actions append after `actions`).
   */
  actions?: BulkAction[];
  /** Folder picker data. When omitted, the legacy "Move" button is hidden. */
  folders?: LibraryFolder[];
  onMove?: (folderId: string | null) => void | Promise<void>;
  /** Delete handler. When omitted, the legacy "Delete" button is hidden. */
  onDelete?: () => void | Promise<void>;
  /** Optional busy flag that disables actions while a batch is in-flight. */
  busy?: boolean;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  count,
  onClear,
  actions,
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
        {/* New multi-action API: render in declaration order. */}
        {actions?.map((action) => {
          const Icon = action.icon;
          // Either the toolbar-wide `busy` or the action's own `disabled`
          // flag should disable the button. Logical OR (not ??) — both are
          // booleans where `true` should win.
          const disabled = Boolean(busy) || Boolean(action.disabled);
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                if (!disabled) void action.onClick();
              }}
              disabled={disabled}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                action.destructive
                  ? 'text-brand-red-dark hover:bg-brand-red-lighter/30'
                  : 'text-brand-blue-dark hover:bg-brand-blue-lighter/40'
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {action.label}
            </button>
          );
        })}

        {/* Legacy folders + onMove API. */}
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

        {/* Legacy onDelete API. */}
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
