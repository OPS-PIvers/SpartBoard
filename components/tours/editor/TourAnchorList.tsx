import React, { useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import {
  TOUR_ANCHORS,
  WHOLE_BOARD_ANCHOR,
  isTourAnchorId,
  parseTourAnchorRef,
  tourAnchorRef,
  type TourAnchorDef,
  type TourAnchorId,
} from '@/config/tourAnchors';
import { Z_INDEX } from '@/config/zIndex';
import { inputLight } from '@/components/common/lightChrome';
import {
  accessibleName,
  isAnchorVisible,
} from '@/components/tours/resolveTourAnchor';
import type { TourSlots } from '@/components/tours/tourSession';
import { registeredAnchorAt, type TourAnchorPick } from './pickAnchor';
import { anchorArea, anchorName, toolName } from './anchorAreas';

interface Props {
  /** The step's current anchor ref, marked in the list. */
  value?: string;
  onPick: (pick: TourAnchorPick) => void;
  /** Tour slot to widget id, so an on-screen widget control records its slot. */
  slots?: TourSlots;
}

interface Entry {
  id: TourAnchorId;
  name: string;
  area: string;
  label: string;
  haystack: string;
}

const ENTRIES: Entry[] = (Object.keys(TOUR_ANCHORS) as TourAnchorId[])
  .filter((id) => id !== WHOLE_BOARD_ANCHOR)
  .map((id) => {
    const def: TourAnchorDef = TOUR_ANCHORS[id];
    const name = anchorName(def.label);
    const area = anchorArea(id);
    return {
      id,
      name,
      area,
      label: def.label,
      haystack: `${def.label} ${area} ${id}`.toLowerCase(),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const AREAS = [...new Set(ENTRIES.map((e) => e.area))].sort((a, b) =>
  a.localeCompare(b)
);

interface OnScreen {
  key: string;
  id: TourAnchorId;
  pick: TourAnchorPick;
  element: HTMLElement;
  name: string;
  detail?: string;
  area: string;
  haystack: string;
}

const SHOWN_PER_AREA = 6;
const MAX_NAME = 40;

// Controls in a widget are named for that widget; the rest by where they live.
const areaOf = (id: TourAnchorId, el: HTMLElement) => {
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  const type =
    el.getAttribute('data-tour-widget-type') ??
    el
      .closest('[data-tour-widget-type]')
      ?.getAttribute('data-tour-widget-type');
  if (id.startsWith('settings.') && type) return `${toolName(type)} settings`;
  if ((def.perWidget ?? def.perField) && type) return toolName(type);
  return anchorArea(id);
};

const CONTROL =
  'button, a, input, select, textarea, label, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"]';

// A control's own words, like "Start"; containers fall back to the registry name.
const ownName = (el: HTMLElement): string | undefined => {
  const labelled =
    el.getAttribute('aria-label') ??
    el.getAttribute('title') ??
    el.getAttribute('placeholder');
  const text = labelled ?? (el.matches(CONTROL) ? accessibleName(el) : '');
  const clean = text.replace(/\s*\(.*\)\s*$/, '').trim();
  if (!clean || clean.length > MAX_NAME) return undefined;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

/** Every registered control showing right now, top to bottom, named by its own text. */
function scanScreen(slots: TourSlots | undefined): OnScreen[] {
  if (typeof document === 'undefined') return [];
  const found: OnScreen[] = [];
  const seen = new Set<string>();
  document.querySelectorAll<HTMLElement>('[data-tour]').forEach((el) => {
    const id = el.getAttribute('data-tour') ?? '';
    if (id === WHOLE_BOARD_ANCHOR || !isTourAnchorId(id)) return;
    if (el.closest('[data-tour-ignore]') || !isAnchorVisible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.right < 0) return;
    if (r.top > window.innerHeight || r.left > window.innerWidth) return;
    const hit = registeredAnchorAt(el, slots);
    if (!hit) return;
    const key = `${hit.pick.anchor}@${hit.pick.slot ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const def: TourAnchorDef = TOUR_ANCHORS[id];
    const own = ownName(el);
    const area = areaOf(id, el);
    const inWidget = !!(def.perWidget ?? def.perField);
    const named = anchorName(def.label);
    const generic =
      inWidget && named.startsWith('Widget ')
        ? `${area} ${named.slice(7)}`
        : named;
    const name = own ?? generic;
    const redundant =
      !own || generic.toLowerCase().startsWith(own.toLowerCase());
    found.push({
      key,
      id,
      pick: hit.pick,
      element: el,
      name,
      detail: redundant ? undefined : generic,
      area,
      haystack: `${name} ${def.label} ${area} ${id}`.toLowerCase(),
    });
  });
  // Widgets and open panels first, then the board's own chrome.
  // The selected widget shows its toolbar, so its controls lead.
  const selected = found.find((o) => o.id === 'widget.toolbar')?.area;
  const rank = (o: OnScreen) =>
    o.area === selected
      ? -1
      : o.area === 'Dock'
        ? 2
        : o.area === 'Menu and top bar' || o.area === 'Board'
          ? 1
          : 0;
  return found.sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    if (a.area !== b.area) return a.area.localeCompare(b.area);
    // Inside a widget, its own controls come before the shared window and toolbar.
    const chrome = (o: OnScreen) => (o.id.startsWith('widget.') ? 1 : 0);
    if (chrome(a) !== chrome(b)) return chrome(a) - chrome(b);
    const ra = a.element.getBoundingClientRect();
    const rb = b.element.getBoundingClientRect();
    return ra.top - rb.top || ra.left - rb.left;
  });
}

const matches = (haystack: string, query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));

type Row =
  | { kind: 'heading'; key: string; text: string }
  | {
      kind: 'group';
      key: string;
      text: string;
      count: number;
      open: boolean;
      toggle: () => void;
    }
  | { kind: 'more'; key: string; count: number; expand: () => void }
  | {
      kind: 'option';
      key: string;
      name: string;
      detail?: string;
      area?: string;
      title?: string;
      selected: boolean;
      element?: HTMLElement;
      choose: () => void;
    };

/** Controls on screen first, named by their own text, then every other control by area. */
export const TourAnchorList: React.FC<Props> = ({ value, onPick, slots }) => {
  const { t } = useTranslation();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [onScreen, setOnScreen] = useState(() => scanScreen(slots));
  const [openAreas, setOpenAreas] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const current = value ? parseTourAnchorRef(value) : undefined;
  const searching = query.trim().length > 0;

  // A per-type anchor keeps the step's widget type; the card's Which widget sets it otherwise.
  const chooseEntry = (id: TourAnchorId) => {
    const def: TourAnchorDef = TOUR_ANCHORS[id];
    const same = current?.id === id;
    const typed = !!(def.perWidgetType ?? def.perField);
    onPick({
      anchor: tourAnchorRef(
        id,
        same || typed ? current?.widgetType : undefined,
        same ? current?.fieldKey : undefined
      ),
    });
  };

  const toggleArea = (key: string) =>
    setOpenAreas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows = useMemo(() => {
    const out: Row[] = [];
    const wholeName = t('tourPicker.wholeBoard');
    const screenRows = onScreen.filter((o) => matches(o.haystack, query));
    const showWhole = matches(
      `${wholeName} ${WHOLE_BOARD_ANCHOR}`.toLowerCase(),
      query
    );
    if (showWhole || screenRows.length) {
      out.push({
        kind: 'heading',
        key: 'h-screen',
        text: t('tourPicker.onScreen'),
      });
    }
    if (showWhole) {
      out.push({
        kind: 'option',
        key: WHOLE_BOARD_ANCHOR,
        name: wholeName,
        selected: current?.id === WHOLE_BOARD_ANCHOR,
        choose: () => onPick({ anchor: WHOLE_BOARD_ANCHOR }),
      });
    }
    const perArea = new Map<string, OnScreen[]>();
    screenRows.forEach((o) => {
      const list = perArea.get(o.area) ?? [];
      list.push(o);
      perArea.set(o.area, list);
    });
    perArea.forEach((list, area) => {
      const expanded = searching || openAreas.has(`screen:${area}`);
      const shown = expanded ? list : list.slice(0, SHOWN_PER_AREA);
      shown.forEach((o) =>
        out.push({
          kind: 'option',
          key: o.key,
          name: o.name,
          detail: o.detail,
          area: o.area,
          title: o.pick.anchor,
          selected: value === o.pick.anchor,
          element: o.element,
          choose: () => onPick(o.pick),
        })
      );
      if (shown.length < list.length) {
        out.push({
          kind: 'more',
          key: `more:${area}`,
          count: list.length - shown.length,
          expand: () => toggleArea(`screen:${area}`),
        });
      }
    });

    const rest = ENTRIES.filter((e) => matches(e.haystack, query));
    if (rest.length) {
      out.push({
        kind: 'heading',
        key: 'h-rest',
        text: t('tourPicker.elsewhere'),
      });
    }
    AREAS.forEach((area) => {
      const list = rest.filter((e) => e.area === area);
      if (!list.length) return;
      const open =
        searching ||
        openAreas.has(area) ||
        list.some((e) => e.id === current?.id);
      out.push({
        kind: 'group',
        key: `g:${area}`,
        text: area,
        count: list.length,
        open,
        toggle: () => toggleArea(area),
      });
      if (!open) return;
      list.forEach((e) =>
        out.push({
          kind: 'option',
          key: e.id,
          name: e.name,
          title: `${e.label} (${e.id})`,
          selected: current?.id === e.id,
          choose: () => chooseEntry(e.id),
        })
      );
    });
    return out;
    // chooseEntry and toggleArea only read state already listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScreen, query, openAreas, value, t, searching]);

  const options = rows.flatMap((r, i) => (r.kind === 'option' ? [i] : []));
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const activeRow = options[activeIndex];
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(
        Math.max(activeIndex + step, 0),
        options.length - 1
      );
      setActive(next);
      document
        .getElementById(`${listId}-${options[next]}`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeRow !== undefined) {
      e.preventDefault();
      const row = rows[activeRow];
      if (row.kind === 'option') row.choose();
    }
  };

  const outline = hovered?.getBoundingClientRect();

  return (
    <div
      className="flex h-full min-h-0 flex-col text-slate-900"
      data-testid="tour-anchor-list"
      data-tour-ignore=""
      onPointerEnter={() => setOnScreen(scanScreen(slots))}
      onPointerLeave={() => setHovered(null)}
    >
      <label className="relative block border-b border-slate-200 px-3 py-2">
        <span className="sr-only">{t('tourPicker.search')}</span>
        <Search
          className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('tourPicker.search')}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            activeRow !== undefined ? `${listId}-${activeRow}` : undefined
          }
          className={`w-full rounded-lg py-1.5 pl-8 pr-2 text-sm ${inputLight}`}
        />
      </label>
      {options.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          {t('tourPicker.noMatches')}
        </p>
      ) : (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('tourPicker.search')}
          className="min-h-0 flex-1 overflow-y-auto pb-2"
        >
          {rows.map((row, i) => {
            if (row.kind === 'heading') {
              return (
                <li
                  key={row.key}
                  role="presentation"
                  className="px-4 pb-1 pt-3 text-xs font-semibold text-slate-500"
                >
                  {row.text}
                </li>
              );
            }
            if (row.kind === 'group') {
              const Chevron = row.open ? ChevronDown : ChevronRight;
              return (
                <li key={row.key} role="presentation">
                  <button
                    type="button"
                    aria-expanded={row.open}
                    onClick={row.toggle}
                    className="flex w-full items-center gap-1.5 border-b border-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Chevron
                      className="h-4 w-4 shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 break-words">
                      {row.text}
                    </span>
                    <span className="text-xs font-normal tabular-nums text-slate-500">
                      {row.count}
                    </span>
                  </button>
                </li>
              );
            }
            if (row.kind === 'more') {
              return (
                <li key={row.key} role="presentation">
                  <button
                    type="button"
                    onClick={row.expand}
                    className="w-full border-b border-slate-100 px-4 py-1.5 text-left text-xs font-semibold text-brand-blue-primary hover:bg-slate-50"
                  >
                    {t('tourPicker.showMore', { count: row.count })}
                  </button>
                </li>
              );
            }
            const isActive = i === activeRow;
            return (
              <li
                key={row.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={row.selected}
                title={row.title}
                onMouseEnter={() => {
                  setActive(options.indexOf(i));
                  setHovered(row.element ?? null);
                }}
                onClick={row.choose}
                className={`flex cursor-pointer items-start gap-2 border-b border-slate-100 px-4 py-2 ${
                  isActive ? 'bg-brand-blue-lighter' : ''
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`break-words text-sm ${row.selected ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                  >
                    {row.name}
                  </span>
                  {row.detail && (
                    <span className="break-words text-xs text-slate-500">
                      {row.detail}
                    </span>
                  )}
                </span>
                {row.area && (
                  <span className="shrink-0 pt-0.5 text-xs text-slate-500">
                    {row.area}
                  </span>
                )}
                {row.selected && (
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue-primary"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {outline &&
        createPortal(
          <div
            aria-hidden="true"
            data-testid="tour-anchor-list-outline"
            className="pointer-events-none fixed rounded-lg border-2 border-white shadow-[0_0_0_2px_rgba(45,63,137,0.9)]"
            style={{
              left: outline.x - 3,
              top: outline.y - 3,
              width: outline.width + 6,
              height: outline.height + 6,
              zIndex: Z_INDEX.tourCallout,
            }}
          />,
          document.body
        )}
    </div>
  );
};
