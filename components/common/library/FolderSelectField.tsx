/**
 * FolderSelectField — labeled folder chooser for editor modals.
 *
 * Presents the current folder as an inline button. Clicking opens a
 * `FolderPickerPopover` (dialog variant) so the teacher can reassign the
 * item while editing — no need to save, close, open the kebab, and move.
 *
 * Controlled: caller owns the `value` and handles `onChange`. Pairs with
 * `useFolders()` on the manager side to persist.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Folder as FolderIcon, Inbox, ChevronDown } from 'lucide-react';
import type { LibraryFolder } from '@/types';
import { FolderPickerPopover } from './FolderPickerPopover';

export interface FolderSelectFieldProps {
  /** All folders for this (user, widget) pair. */
  folders: LibraryFolder[];
  /** Currently-selected folder id (`null` = root / unfoldered). */
  value: string | null;
  onChange: (folderId: string | null) => void;
  /** Field label, e.g. "Folder". Defaults to "Folder". */
  label?: string;
  /** Disables the field and tooltips with `disabledReason`. */
  disabled?: boolean;
  disabledReason?: string;
}

export const FolderSelectField: React.FC<FolderSelectFieldProps> = ({
  folders,
  value,
  onChange,
  label = 'Folder',
  disabled = false,
  disabledReason,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentFolder = useMemo(
    () =>
      value == null ? null : (folders.find((f) => f.id === value) ?? null),
    [folders, value]
  );

  const displayName =
    value == null
      ? 'No folder'
      : currentFolder
        ? currentFolder.name
        : 'Folder not found';

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {label}
      </label>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
        title={disabled ? disabledReason : undefined}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:border-brand-blue-primary/40 hover:bg-brand-blue-lighter/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {value == null ? (
          <Inbox className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <FolderIcon className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <span className="flex-1 truncate">{displayName}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {pickerOpen && (
        <FolderPickerPopover
          variant="popover"
          anchorRef={buttonRef}
          folders={folders}
          selectedFolderId={value}
          onSelect={onChange}
          onClose={() => setPickerOpen(false)}
          title={`Select ${label.toLowerCase()}`}
        />
      )}
    </div>
  );
};
