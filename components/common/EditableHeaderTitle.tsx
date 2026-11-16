import React from 'react';
import { Pencil } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

interface EditableHeaderTitleProps {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  id?: string;
  /** White text and hover tint for a colored header. */
  onAccent?: boolean;
  tourAttrs?: TourAnchorAttrs;
  /** Shows the title as text with no pencil or hover tint. */
  readOnly?: boolean;
}

/** Editor header title input with a pencil and hover tint so it reads as renameable. */
export const EditableHeaderTitle: React.FC<EditableHeaderTitleProps> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  id,
  onAccent = false,
  tourAttrs,
  readOnly = false,
}) => {
  const text = onAccent
    ? 'text-white placeholder:text-white/60'
    : 'text-slate-800 placeholder:text-slate-400';
  return (
    // The label makes the pencil and padding focus the input.
    <label
      className={`group -mx-1.5 flex max-w-[calc(100%+0.75rem)] min-w-0 items-center gap-1.5 self-start rounded-md px-1.5 transition-colors ${
        readOnly
          ? ''
          : onAccent
            ? 'cursor-text hover:bg-white/15 focus-within:bg-white/15'
            : 'cursor-text hover:bg-slate-100 focus-within:bg-slate-100'
      }`}
    >
      <span className="inline-grid min-w-0 max-w-full">
        <span
          aria-hidden="true"
          className="invisible col-start-1 row-start-1 truncate whitespace-pre text-lg font-black"
        >
          {value || placeholder}
        </span>
        <input
          id={id}
          type="text"
          size={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          readOnly={readOnly}
          {...tourAttrs}
          className={`col-start-1 row-start-1 w-full min-w-0 truncate border-0 bg-transparent p-0 text-lg font-black placeholder:font-bold focus:outline-hidden focus:ring-0 ${text}`}
        />
      </span>
      {!readOnly && (
        <Pencil
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 transition-opacity group-focus-within:opacity-0 ${
            onAccent ? 'text-white/80' : 'text-slate-400'
          }`}
        />
      )}
    </label>
  );
};
