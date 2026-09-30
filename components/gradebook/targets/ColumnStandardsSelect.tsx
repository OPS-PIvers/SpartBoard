import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import type { GradebookTargetTag } from '@/utils/gradebook/gradebookCore';
import {
  useColumnTargetCatalog,
  type TargetCatalogEntry,
} from './useColumnTargetCatalog';

const MAX_ROWS = 60;
const EDGE = 12;

const tagCode = (t: GradebookTargetTag): string => t.code ?? t.label;

interface ColumnStandardsSelectProps {
  id?: string;
  targets: GradebookTargetTag[];
  onChange: (next: GradebookTargetTag[]) => void;
  disabled?: boolean;
}

/** D29 whole-column tags: a select-style button and a searchable checklist menu. */
export const ColumnStandardsSelect: React.FC<ColumnStandardsSelectProps> = ({
  id,
  targets,
  onChange,
  disabled,
}) => {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = anchor !== null;
  const wrapRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, () => setAnchor(null));

  return (
    <div ref={wrapRef} className="min-w-0">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          const button = e.currentTarget;
          setAnchor((a) => (a ? null : button));
        }}
        title={targets.map((t) => `${tagCode(t)} ${t.label}`).join('\n')}
        className={`flex h-9 w-full min-w-0 items-center gap-1.5 rounded-lg border bg-white pl-2.5 pr-2 text-left text-[13px] font-medium text-slate-800 disabled:opacity-50 ${
          open
            ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
            : 'border-slate-300'
        }`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${targets.length ? '' : 'text-slate-400'}`}
        >
          {targets.length ? targets.map(tagCode).join(', ') : 'None'}
        </span>
        <ChevronDown
          aria-hidden
          className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {anchor && (
        <StandardsMenu
          anchor={anchor}
          targets={targets}
          onChange={onChange}
          onClose={() => {
            setAnchor(null);
            anchor.focus();
          }}
        />
      )}
    </div>
  );
};

const StandardsMenu: React.FC<{
  anchor: HTMLElement;
  targets: GradebookTargetTag[];
  onChange: (next: GradebookTargetTag[]) => void;
  onClose: () => void;
}> = ({ anchor, targets, onChange, onClose }) => {
  const { entries } = useColumnTargetCatalog();
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  // Fixed, but inside the parent popover's DOM so its outside-click logic keeps it open.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      const left = Math.max(
        EDGE,
        Math.min(r.right - pw, window.innerWidth - pw - EDGE)
      );
      const below = window.innerHeight - r.bottom - 16;
      const down = below >= Math.min(ph, 240) || below >= r.top;
      const maxHeight = down ? below : r.top - 16;
      const top = down
        ? r.bottom + 4
        : Math.max(EDGE, r.top - Math.min(ph, maxHeight) - 4);
      setPos((p) =>
        p && p.top === top && p.left === left && p.maxHeight === maxHeight
          ? p
          : { top, left, maxHeight }
      );
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(panel);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  const selectedIds = useMemo(
    () => new Set(targets.map((t) => t.id)),
    [targets]
  );
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const inCatalog = entries.filter((e) => selectedIds.has(e.tag.id));
    const known = new Set(inCatalog.map((e) => e.tag.id));
    const selected: TargetCatalogEntry[] = [
      ...inCatalog,
      ...targets
        .filter((tag) => !known.has(tag.id))
        .map((tag) => ({
          tag,
          search: `${tag.code ?? ''} ${tag.label}`.toLowerCase(),
        })),
    ];
    const rest = entries.filter((e) => !selectedIds.has(e.tag.id));
    return [...selected, ...rest]
      .filter((e) => !q || e.search.includes(q))
      .slice(0, MAX_ROWS);
  }, [entries, targets, selectedIds, q]);

  const toggle = (tag: GradebookTargetTag) =>
    onChange(
      selectedIds.has(tag.id)
        ? targets.filter((t) => t.id !== tag.id)
        : [...targets, tag]
    );

  return (
    <div
      ref={panelRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        maxHeight: pos?.maxHeight,
      }}
      className="fixed z-popover flex w-[280px] flex-col gap-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
    >
      <div className="relative p-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${entries.length} standards`}
          aria-label="Search standards"
          className="h-[34px] w-full rounded-lg border border-slate-300 pl-8 pr-2 text-[13px] focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-lighter"
        />
      </div>
      <div className="px-1 text-xs text-slate-500">
        {targets.length} selected
      </div>
      <div
        role="menu"
        aria-label="Standards"
        className="flex max-h-[280px] flex-col overflow-y-auto pb-1"
      >
        {rows.length === 0 ? (
          <div className="p-2 text-xs text-slate-500">No matches</div>
        ) : (
          rows.map(({ tag }) => {
            const on = selectedIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => toggle(tag)}
                title={tag.label}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] leading-4 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${
                  on ? 'font-semibold text-slate-900' : 'text-slate-700'
                }`}
              >
                <span className="inline-grid h-4 w-4 flex-none place-items-center text-brand-blue-primary">
                  {on && <Check aria-hidden className="h-4 w-4" />}
                </span>
                <b className="min-w-10 flex-none font-bold text-slate-800">
                  {tagCode(tag)}
                </b>
                <span className="min-w-0 truncate">{tag.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
