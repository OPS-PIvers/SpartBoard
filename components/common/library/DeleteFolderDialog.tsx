import React, { useId, useState } from 'react';
import { Folder, Loader2, Lock, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { LibraryFolder } from '@/types';
import { folderColorSwatch } from './folderColors';

export type DeleteFolderChoice = 'keep' | 'delete-everything';

export interface LibraryItemNoun {
  one: string;
  many: string;
}

export interface DeleteFolderDialogProps {
  folder: LibraryFolder;
  /** Where kept contents go: the parent folder's name, or "Library" at the top level. */
  parentName: string;
  /** Folders below this one, at any depth. */
  subfolderCount: number;
  /** Items in this folder and every subfolder. */
  itemCount: number;
  noun: LibraryItemNoun;
  /** Items the widget won't delete yet (e.g. live assignments); kept and moved to the parent. */
  blockedCount?: number;
  /** Sentence naming why blocked items are kept, e.g. "2 quizzes have live assignments". */
  blockedReason?: string;
  /** Lines about items that go elsewhere, e.g. filed shared items going back to their source folder. */
  notes?: (choice: DeleteFolderChoice) => React.ReactNode[];
  /** Omit to offer only "Keep everything" (the widget has no delete path wired). */
  canDeleteItems?: boolean;
  onCancel: () => void;
  onConfirm: (choice: DeleteFolderChoice) => Promise<void>;
}

const countOf = (n: number, noun: LibraryItemNoun): string =>
  `${n} ${n === 1 ? noun.one : noun.many}`;

const FOLDER_NOUN: LibraryItemNoun = { one: 'folder', many: 'folders' };

/** Joins non-empty counts: "2 folders and 9 sets", "9 sets", "2 folders". */
const joinCounts = (parts: string[], sep: string): string =>
  parts.filter(Boolean).join(sep);

export const DeleteFolderDialog: React.FC<DeleteFolderDialogProps> = ({
  folder,
  parentName,
  subfolderCount,
  itemCount,
  noun,
  blockedCount = 0,
  blockedReason,
  notes,
  canDeleteItems = true,
  onCancel,
  onConfirm,
}) => {
  const titleId = useId();
  const [choice, setChoice] = useState<DeleteFolderChoice>('keep');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subfolders =
    subfolderCount > 0 ? countOf(subfolderCount, FOLDER_NOUN) : '';
  const items = itemCount > 0 ? countOf(itemCount, noun) : '';
  const deletableCount = Math.max(0, itemCount - blockedCount);
  const deleting = choice === 'delete-everything';
  const swatch = folderColorSwatch(folder.color);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(choice);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const option = (
    value: DeleteFolderChoice,
    title: string,
    detail: React.ReactNode
  ): React.ReactNode => {
    const selected = choice === value;
    const danger = value === 'delete-everything';
    return (
      <label
        className={`flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm cursor-pointer transition-colors ${
          selected
            ? danger
              ? 'border-brand-red-primary bg-brand-red-lighter/40'
              : 'border-brand-blue-primary bg-brand-blue-lighter'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <input
          type="radio"
          name={`${titleId}-choice`}
          value={value}
          checked={selected}
          onChange={() => setChoice(value)}
          disabled={busy}
          className={`mt-0.5 shrink-0 ${danger ? 'accent-brand-red-primary' : 'accent-brand-blue-primary'}`}
        />
        <span>
          <span className="block font-semibold text-slate-800">{title}</span>
          <span className="block text-xs text-slate-500 mt-0.5">{detail}</span>
        </span>
      </label>
    );
  };

  const header = (
    <div className="flex items-center gap-2.5 px-5 pt-5">
      <span
        className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 ${swatch?.icon ?? 'text-amber-700'}`}
      >
        <Folder className="w-5 h-5" aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-0">
        <h2 id={titleId} className="font-bold text-brand-blue-dark text-base">
          Delete “{folder.name}”?
        </h2>
        <p className="text-xs text-slate-500">
          {joinCounts([subfolders, items], ' · ')} inside
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="self-start p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={busy}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 ${
          deleting
            ? 'bg-brand-red-primary hover:bg-brand-red-dark'
            : 'bg-brand-blue-primary hover:bg-brand-blue-dark'
        }`}
      >
        {busy && (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        )}
        {deleting && deletableCount > 0
          ? `Delete ${countOf(deletableCount, noun)}`
          : 'Delete folder'}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={busy ? () => undefined : onCancel}
      maxWidth="max-w-md"
      customHeader={header}
      ariaLabelledby={titleId}
      contentClassName="px-5 pt-3 pb-1 space-y-2"
      footer={footer}
      footerClassName="px-5 pb-5 pt-3"
      captureEscape
    >
      <p className="text-sm text-slate-600 pb-1">
        What should happen to what’s inside?
      </p>
      <div role="radiogroup" aria-labelledby={titleId} className="space-y-2">
        {option(
          'keep',
          'Keep everything',
          <>
            Move the {joinCounts([subfolders, items], ' and ')} to{' '}
            <b className="font-semibold">{parentName}</b>. Only the folder goes
            away.
          </>
        )}
        {canDeleteItems &&
          option(
            'delete-everything',
            'Delete the folder and everything in it',
            `Deletes ${joinCounts(
              [
                countOf(subfolderCount + 1, FOLDER_NOUN),
                deletableCount > 0 ? countOf(deletableCount, noun) : '',
              ],
              ' and '
            )}. You can’t undo this.`
          )}
      </div>
      {deleting && blockedCount > 0 && blockedReason && (
        <p className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Lock
            className="w-3.5 h-3.5 shrink-0 mt-px text-amber-700"
            aria-hidden="true"
          />
          <span>
            {blockedReason}, so {blockedCount === 1 ? 'it' : 'they'}’ll be kept
            and moved to <b className="font-semibold">{parentName}</b>.
          </span>
        </p>
      )}
      {(notes?.(choice) ?? []).map((note, i) => (
        <p
          key={i}
          className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"
        >
          {note}
        </p>
      ))}
      {error && (
        <p role="alert" className="text-xs text-brand-red-primary">
          {error}
        </p>
      )}
    </Modal>
  );
};
