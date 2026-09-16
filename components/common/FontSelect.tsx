import React, { useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { FONTS } from '@/config/fonts';
import { useClickOutside } from '@/hooks/useClickOutside';

export type FontId = (typeof FONTS)[number]['id'];

const OPTIONS = FONTS.map((f) => ({
  id: f.id,
  label: f.id === 'global' ? 'Default' : f.label,
  className: f.className,
}));

interface FontSelectProps {
  /** A `FONTS` id; `'global'` (or unknown) shows "Default". */
  value: string | undefined;
  onChange: (id: FontId) => void;
  labelId?: string;
  describedBy?: string;
  disabled?: boolean;
}

// Dropdown font picker; each option previews in its own typeface.
export const FontSelect: React.FC<FontSelectProps> = ({
  value,
  onChange,
  labelId,
  describedBy,
  disabled = false,
}) => {
  const uid = useId();
  const listId = `${uid}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    OPTIONS.findIndex((o) => o.id === value)
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = OPTIONS[selectedIndex];

  useClickOutside(rootRef, () => setOpen(false));

  const openList = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
    requestAnimationFrame(() => {
      listRef.current?.focus();
      listRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    onChange(OPTIONS[index].id);
    close();
  };

  const moveActive = (next: number) => {
    const clamped = Math.min(OPTIONS.length - 1, Math.max(0, next));
    setActiveIndex(clamped);
    document
      .getElementById(`${uid}-opt-${clamped}`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveActive(activeIndex + 1),
      ArrowUp: () => moveActive(activeIndex - 1),
      Home: () => moveActive(0),
      End: () => moveActive(OPTIONS.length - 1),
      Enter: () => choose(activeIndex),
      ' ': () => choose(activeIndex),
      Escape: close,
      Tab: () => setOpen(false),
    };
    const action = keys[e.key];
    if (!action) return;
    if (e.key !== 'Tab') e.preventDefault();
    // Escape must not also close the surrounding drawer.
    e.stopPropagation();
    action();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId ? `${labelId} ${uid}-value` : undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openList();
          }
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-slate-800 transition-colors hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-50"
      >
        <span
          id={`${uid}-value`}
          className={`truncate text-sm ${selected.className}`}
        >
          {selected.label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={`${uid}-opt-${activeIndex}`}
          onKeyDown={onListKeyDown}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg focus:outline-none"
        >
          {OPTIONS.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li
                key={option.id}
                id={`${uid}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-base text-slate-800 ${
                  index === activeIndex ? 'bg-slate-100' : ''
                } ${option.className}`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <Check
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-brand-blue-primary"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
