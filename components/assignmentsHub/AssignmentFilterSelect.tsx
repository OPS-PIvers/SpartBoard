// AssignmentFilterSelect — dropdown used by the Assignments hub filter bar; single- or multi-select over a flat option list.

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';

export interface AssignmentFilterOption {
  value: string;
  label: string;
}

interface AssignmentFilterSelectProps {
  /** Accessible name for the trigger, e.g. "Filter by type". */
  label: string;
  /** Visible trigger text — the caller formats the active selection. */
  summary: string;
  options: AssignmentFilterOption[];
  /** Empty means "no filter"; the `allLabel` row is shown as selected. */
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
  multiple?: boolean;
}

export const AssignmentFilterSelect: React.FC<AssignmentFilterSelectProps> = ({
  label,
  summary,
  options,
  selected,
  onChange,
  allLabel,
  multiple = false,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const isFiltered = selected.length > 0;

  const handleOption = (value: string) => {
    if (!multiple) {
      onChange([value]);
      setOpen(false);
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  // Capture phase + stopImmediatePropagation so this dropdown's Escape wins
  // over the hub's own document-level Escape handler regardless of mount
  // order — same pattern as MoveToCollectionMenu/CollectionColorPicker. A
  // React onKeyDown on the wrapper div isn't enough: opening via a mouse
  // click doesn't reliably focus the trigger button in every browser, so
  // focus may never be inside this div when Escape is pressed.
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isEscapeFromWidgetInput(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex w-full items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          isFiltered
            ? 'border-brand-blue-primary/40 bg-brand-blue-lighter/30 text-brand-blue-primary'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${
            isFiltered ? 'text-brand-blue-primary' : 'text-slate-400'
          } ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          aria-multiselectable={multiple || undefined}
          className="absolute left-0 top-full z-30 mt-1 min-w-full max-w-[16rem] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={!isFiltered}
            onClick={() => {
              onChange([]);
              if (!multiple) setOpen(false);
            }}
            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
              !isFiltered
                ? 'bg-brand-blue-lighter/30 font-bold text-brand-blue-primary'
                : 'font-medium text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="truncate">{allLabel}</span>
            {!isFiltered && <Check className="w-3.5 h-3.5 shrink-0" />}
          </button>

          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleOption(opt.value)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-brand-blue-lighter/30 font-bold text-brand-blue-primary'
                    : 'font-medium text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
