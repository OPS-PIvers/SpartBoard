import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search } from 'lucide-react';
import {
  TOUR_ANCHORS,
  WHOLE_BOARD_ANCHOR,
  parseTourAnchorRef,
  tourAnchorRef,
  type TourAnchorDef,
  type TourAnchorId,
} from '@/config/tourAnchors';
import type { TourAnchorPick } from './pickAnchor';

interface Props {
  /** The step's current anchor ref, marked in the list. */
  value?: string;
  onPick: (pick: TourAnchorPick) => void;
}

const ENTRIES = (Object.keys(TOUR_ANCHORS) as TourAnchorId[])
  .filter((id) => id !== WHOLE_BOARD_ANCHOR)
  .map((id) => {
    const def: TourAnchorDef = TOUR_ANCHORS[id];
    return {
      id,
      label: def.label,
      haystack: `${def.label} ${id}`.toLowerCase(),
    };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

const matches = (haystack: string, query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));

/** Searchable list of every registered anchor, with Whole board first. */
export const TourAnchorList: React.FC<Props> = ({ value, onPick }) => {
  const { t } = useTranslation();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const current = value ? parseTourAnchorRef(value) : undefined;

  const rows = useMemo(() => {
    const found = ENTRIES.filter((e) => matches(e.haystack, query));
    const whole = matches(
      `${t('tourPicker.wholeBoard')} ${WHOLE_BOARD_ANCHOR}`.toLowerCase(),
      query
    );
    return whole
      ? [
          { id: WHOLE_BOARD_ANCHOR, label: t('tourPicker.wholeBoard') },
          ...found,
        ]
      : found;
  }, [query, t]);

  // A per-type anchor keeps the step's widget type; the card's Which widget sets it otherwise.
  const choose = (id: TourAnchorId) => {
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

  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(Math.max(activeIndex + step, 0), rows.length - 1);
      setActive(next);
      document
        .getElementById(`${listId}-${next}`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && rows[activeIndex]) {
      e.preventDefault();
      choose(rows[activeIndex].id);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col text-white"
      data-testid="tour-anchor-list"
      data-tour-ignore=""
    >
      <label className="relative block border-b border-white/10 px-3 py-2">
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
            rows.length ? `${listId}-${activeIndex}` : undefined
          }
          className="w-full rounded-lg bg-white/10 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        />
      </label>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-300">
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
            const selected = current?.id === row.id;
            return (
              <li
                key={row.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(row.id)}
                className={`flex cursor-pointer items-center gap-2 border-b border-white/5 px-4 py-2 ${
                  i === activeIndex ? 'bg-white/10' : ''
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`text-sm ${selected ? 'font-semibold text-white' : 'text-slate-200'}`}
                  >
                    {row.label}
                  </span>
                  {row.id !== WHOLE_BOARD_ANCHOR && (
                    <span className="truncate font-mono text-xxs text-slate-300">
                      {row.id}
                    </span>
                  )}
                </span>
                {selected && (
                  <Check
                    className="h-4 w-4 shrink-0 text-white"
                    aria-hidden="true"
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
