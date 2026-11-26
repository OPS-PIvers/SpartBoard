import React, {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { WidgetAccentScope } from '@/components/common/WidgetAccentScope';
import { Check, ChevronDown } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { useClickOutside } from '@/hooks/useClickOutside';
import { SearchField } from '@/components/common/SearchField';

export interface ChecklistOption {
  id: string;
  label: string;
  /** Bold code before the label, such as a standard's code. */
  code?: string;
  /** Quiet text beside an unchecked row, such as the set a building is on now. */
  note?: string;
  /** Live-tour anchor for the row. */
  anchor?: TourAnchorAttrs;
}

export const CHECKLIST_FIELD =
  'h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-hidden focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30 disabled:bg-slate-50 disabled:text-slate-500';

const EDGE = 8;
const GAP = 4;

export interface ChecklistSelectProps {
  label: string;
  options: ChecklistOption[];
  selected: readonly string[];
  onToggle: (id: string, checked: boolean) => void;
  /** Button text with nothing picked, and the menu text when nothing matches. */
  emptyText: string;
  /** Menu text when the search matches nothing; defaults to emptyText. */
  noMatchesText?: string;
  /** Button text; defaults to the picked labels (or codes) joined. */
  summary?: string;
  disabled?: boolean;
  id?: string;
  /** Layout classes added to the default field look. */
  className?: string;
  /** Replaces the field look entirely, e.g. a compact filter. */
  triggerClassName?: string;
  title?: string;
  anchor?: TourAnchorAttrs;
  /** A search box appears above the rows past this many options. */
  searchFrom?: number;
  searchPlaceholder?: string;
  searchAnchor?: TourAnchorAttrs;
  /** Shows "N selected" under the search box. */
  showCount?: boolean;
  /** Caps the rows rendered for very long lists. */
  maxRows?: number;
  /** Tells a parent dialog the menu is open, e.g. so its own Escape waits. */
  onOpenChange?: (open: boolean) => void;
}

/** Select-style button that opens a checklist menu and stays open while picking. */
export const ChecklistSelect: React.FC<ChecklistSelectProps> = ({
  label,
  options,
  selected,
  onToggle,
  emptyText,
  noMatchesText = emptyText,
  summary,
  disabled,
  id,
  className = '',
  triggerClassName,
  title,
  anchor,
  searchFrom = 8,
  searchPlaceholder = 'Search',
  searchAnchor,
  showCount = false,
  maxRows,
  onOpenChange,
}) => {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const picked = new Set(selected);
  const pickedOptions = options.filter((o) => picked.has(o.id));
  const text =
    summary ??
    (pickedOptions.length
      ? pickedOptions.map((o) => o.code ?? o.label).join(', ')
      : emptyText);
  const q = search.trim().toLowerCase();
  const matching = q
    ? options.filter((o) =>
        `${o.code ?? ''} ${o.label}`.toLowerCase().includes(q)
      )
    : options;
  const shown = maxRows ? matching.slice(0, maxRows) : matching;
  const searchable = options.length > searchFrom;

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  useClickOutside(panelRef, (e) => {
    if (triggerRef.current?.contains(e.target as Node)) return;
    close();
  });

  // A full search box clears first, like every SearchField.
  const closeOnEscape = useEffectEvent(() => {
    if (search !== '') {
      setSearch('');
      return;
    }
    close();
    triggerRef.current?.focus();
  });

  // Capture phase so Escape closes only this menu, not a dialog or popover under it.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      closeOnEscape();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  // Without a search box, focus starts on the first checked row so the keyboard reaches the menu.
  useEffect(() => {
    if (!open || searchable) return;
    const rows = panelRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitemcheckbox"]'
    );
    const list = Array.from(rows ?? []);
    (
      list.find((r) => r.getAttribute('aria-checked') === 'true') ?? list[0]
    )?.focus();
  }, [open, searchable]);

  const reportClosed = useEffectEvent(() => onOpenChange?.(false));
  useEffect(() => {
    if (!open) return undefined;
    return () => reportClosed();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const panel = panelRef.current;
      const pw = panel?.offsetWidth ?? Math.max(r.width, 260);
      const ph = panel?.scrollHeight ?? 0;
      const left = Math.max(
        EDGE,
        Math.min(r.left, window.innerWidth - pw - EDGE)
      );
      const below = window.innerHeight - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const down = below >= Math.min(ph, 240) || below >= above;
      const maxHeight = Math.min(360, down ? below : above);
      const top = down ? r.bottom + GAP : r.top - GAP - Math.min(ph, maxHeight);
      setPos((p) =>
        p &&
        p.top === top &&
        p.left === left &&
        p.maxHeight === maxHeight &&
        p.minWidth === r.width
          ? p
          : { top, left, maxHeight, minWidth: r.width }
      );
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, shown.length]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemcheckbox"]'
      ) ?? []
    );
    if (rows.length === 0) return;
    const idx = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? rows[(idx + 1) % rows.length]
        : rows[idx <= 0 ? rows.length - 1 : idx - 1];
    next?.focus();
  };

  return (
    <>
      <button
        {...anchor}
        ref={triggerRef}
        id={id}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' || open) return;
          e.preventDefault();
          setOpen(true);
        }}
        className={
          triggerClassName ??
          `${CHECKLIST_FIELD} flex min-w-0 items-center gap-2 text-left ${className}`
        }
      >
        <span
          className={`min-w-0 flex-1 truncate ${pickedOptions.length || summary ? '' : 'text-slate-400'}`}
        >
          {text}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open &&
        createPortal(
          <WidgetAccentScope>
            <div
              ref={panelRef}
              data-click-outside-ignore="true"
              onKeyDown={onMenuKeyDown}
              style={{
                position: 'fixed',
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                minWidth: Math.max(pos?.minWidth ?? 0, 260),
                maxHeight: pos?.maxHeight,
              }}
              className="z-popover flex max-w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            >
              {searchable && (
                <div className="shrink-0 p-1">
                  <SearchField
                    autoFocus
                    value={search}
                    onChange={setSearch}
                    placeholder={searchPlaceholder}
                    ariaLabel={`Search ${label.toLowerCase()}`}
                    anchor={searchAnchor}
                    size="sm"
                  />
                </div>
              )}
              {showCount && (
                <div className="shrink-0 px-2 pb-1 text-xs text-slate-500">
                  {selected.length} selected
                </div>
              )}
              <div
                role="menu"
                aria-label={label}
                className="scroll-inset flex min-h-0 flex-col overflow-y-auto pb-1"
              >
                {shown.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-500">
                    {noMatchesText}
                  </p>
                )}
                {shown.map((o) => {
                  const on = picked.has(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      {...o.anchor}
                      title={o.label}
                      onClick={() => onToggle(o.id, !on)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus:outline-hidden ${on ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                    >
                      <span className="w-4 shrink-0 text-brand-blue-primary">
                        {on && <Check size={16} aria-hidden />}
                      </span>
                      {o.code && (
                        <b className="min-w-10 shrink-0 font-bold text-slate-800">
                          {o.code}
                        </b>
                      )}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {!on && o.note && (
                        <span className="shrink-0 text-[11px] font-normal text-slate-400">
                          {o.note}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </WidgetAccentScope>,
          document.body
        )}
    </>
  );
};
