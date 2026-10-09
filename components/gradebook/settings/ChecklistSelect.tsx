import React, { useRef, useState } from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { Check, ChevronDown } from 'lucide-react';
import { CellPopover } from '@/components/admin/Organization/components/primitives';

export interface ChecklistOption {
  id: string;
  label: string;
  /** Quiet text beside an unchecked row, such as the set a building is on now. */
  note?: string;
}

const FIELD =
  'h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30 disabled:bg-slate-50 disabled:text-slate-500';

/** Select-style button that opens a checklist menu and stays open while picking. */
export const ChecklistSelect: React.FC<{
  label: string;
  options: ChecklistOption[];
  selected: readonly string[];
  onToggle: (id: string, checked: boolean) => void;
  emptyText: string;
  disabled?: boolean;
  className?: string;
  anchor?: TourAnchorAttrs;
}> = ({
  label,
  options,
  selected,
  onToggle,
  emptyText,
  disabled,
  className = '',
  anchor,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLButtonElement>(null);
  const picked = new Set(selected);
  const names = options.filter((o) => picked.has(o.id)).map((o) => o.label);
  const q = search.trim().toLowerCase();
  const shown = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  return (
    <>
      <button
        {...anchor}
        ref={ref}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${FIELD} flex min-w-0 items-center gap-2 text-left ${className}`}
      >
        <span
          className={`flex-1 truncate ${names.length ? '' : 'text-slate-400'}`}
        >
          {names.length ? names.join(', ') : emptyText}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-slate-400"
          aria-hidden
        />
      </button>
      <CellPopover
        open={open}
        onClose={() => {
          setOpen(false);
          setSearch('');
        }}
        anchorRef={ref}
        className="max-h-[300px] overflow-y-auto"
      >
        <div role="menu" aria-label={label} className="min-w-[260px]">
          {options.length > 8 && (
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              aria-label={`Search ${label.toLowerCase()}`}
              className={`${FIELD} mb-1 w-full`}
            />
          )}
          {shown.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-500">{emptyText}</p>
          )}
          {shown.map((o) => {
            const on = picked.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onToggle(o.id, !on)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none ${on ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
              >
                <span className="w-4 shrink-0 text-brand-blue-primary">
                  {on && <Check size={16} aria-hidden />}
                </span>
                <span className="flex-1 truncate">{o.label}</span>
                {!on && o.note && (
                  <span className="text-[11px] font-normal text-slate-400">
                    {o.note}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CellPopover>
    </>
  );
};
