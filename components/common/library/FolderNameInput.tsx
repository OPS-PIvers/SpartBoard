import React, { useEffect, useRef } from 'react';
import { isImeComposing } from '@/utils/imeComposing';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

interface FolderNameInputProps {
  /** Current name when renaming; empty for a new folder. */
  initial: string;
  placeholder?: string;
  /** Called with the trimmed name when it is non-empty and changed. */
  onCommit: (name: string) => void;
  onCancel: () => void;
  anchor?: TourAnchorAttrs;
  className?: string;
}

const DEFAULT_CLASS =
  'flex-1 min-w-0 bg-white border border-brand-blue-primary/40 rounded-sm px-1.5 py-0.5 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40';

/** The one inline name field for creating or renaming a folder or collection: Enter or blur saves, Escape cancels. */
export const FolderNameInput: React.FC<FolderNameInputProps> = ({
  initial,
  placeholder,
  onCommit,
  onCancel,
  anchor,
  className = DEFAULT_CLASS,
}) => {
  const ref = useRef<HTMLInputElement>(null);
  // Set before onCancel so the blur fired by unmounting doesn't commit the cancelled text (Bug #1965).
  const isCancellingRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const settle = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed && trimmed !== initial) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      {...anchor}
      type="text"
      defaultValue={initial}
      placeholder={placeholder}
      onBlur={(e) => {
        // Enter already settled and unmounted this input; skip the blur that removal fires.
        if (!e.currentTarget?.isConnected) return;
        if (isCancellingRef.current) {
          isCancellingRef.current = false;
          return;
        }
        settle(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (isImeComposing(e)) return e.stopPropagation();
          e.preventDefault();
          isCancellingRef.current = true;
          settle(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          isCancellingRef.current = true;
          onCancel();
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={className}
    />
  );
};
