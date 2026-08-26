import React from 'react';

/**
 * Shared segmented (pill) control. A row of mutually-exclusive options
 * rendered as a tablist, with the active option raised on a white surface.
 *
 * Promoted verbatim from `components/admin/Organization/components/primitives.tsx`
 * to `components/common/` so widget settings panels and admin config panels can
 * share a single accessible implementation instead of hand-rolling the
 * `flex bg-slate-100 p-1 rounded-*` pattern per file.
 *
 * Implements the WAI-ARIA tablist keyboard pattern (select-follows-focus,
 * roving tabIndex) — see `sessionViews/SegmentedTabs.tsx` for the reference
 * implementation this mirrors.
 */
export const SegmentedControl: <T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) => React.ReactElement = ({ value, onChange, options, ariaLabel }) => {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== 'ArrowRight' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'Home' &&
      e.key !== 'End'
    )
      return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const nodes = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );
    if (nodes.length === 0) return;
    e.preventDefault();
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const safeIdx = idx < 0 ? 0 : idx;
    let nextIdx: number;
    if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = nodes.length - 1;
    } else if (e.key === 'ArrowRight') {
      nextIdx = (safeIdx + 1) % nodes.length;
    } else {
      nextIdx = (safeIdx - 1 + nodes.length) % nodes.length;
    }
    const nextOption = options[nextIdx];
    if (!nextOption) return;
    nodes[nextIdx].focus();
    onChange(nextOption.value);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="inline-flex p-1 bg-slate-100 rounded-lg"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`h-8 px-3 rounded-md text-xs font-semibold transition-all ${
              selected
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
