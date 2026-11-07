// Cards step for a Flashcards submission assignment: all, N random, or teacher-picked.
import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { FlashcardCard } from '@/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { tourAttr } from '@/config/tourAnchors';
import {
  clampRandomCount,
  defaultRandomCount,
  pickedCardIds,
  type FlashcardsCardsValue,
} from './flashcardsCardsValue';

export interface FlashcardsCardsStepProps {
  value: FlashcardsCardsValue;
  onChange: (value: FlashcardsCardsValue) => void;
  cards: readonly FlashcardCard[];
}

type Mode = FlashcardsCardsValue['mode'];

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: 'all', label: 'All cards' },
  { value: 'random', label: 'Random cards' },
  { value: 'pick', label: 'Choose cards' },
];

const ROW_CLASS = 'flex min-h-8 items-center justify-between gap-3';
const LABEL_CLASS = 'text-sm font-bold text-brand-blue-dark';
const LINK_CLASS =
  'text-xs font-bold text-brand-blue-primary hover:underline disabled:text-slate-400 disabled:no-underline';

export const FlashcardsCardsStep: React.FC<FlashcardsCardsStepProps> = ({
  value,
  onChange,
  cards,
}) => {
  const [query, setQuery] = useState('');
  const cardCount = cards.length;
  const randomAvailable = cardCount >= 2;
  const options = randomAvailable
    ? MODE_OPTIONS
    : MODE_OPTIONS.filter((o) => o.value !== 'random');
  const picked = useMemo(
    () => new Set(pickedCardIds(value, cards)),
    [value, cards]
  );
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? cards.filter(
        (card) =>
          card.term.toLowerCase().includes(needle) ||
          card.definition.toLowerCase().includes(needle)
      )
    : cards;

  const changeMode = (mode: Mode): void => {
    if (mode === value.mode) return;
    if (mode === 'random') {
      onChange({ mode, count: defaultRandomCount(cardCount) });
    } else if (mode === 'pick') {
      onChange({ mode, cardIds: cards.map((card) => card.id) });
    } else {
      onChange({ mode });
    }
  };

  const setPicked = (ids: Set<string>): void =>
    onChange({
      mode: 'pick',
      cardIds: cards.filter((card) => ids.has(card.id)).map((c) => c.id),
    });

  const togglePick = (id: string, on: boolean): void => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  return (
    <div className="space-y-3">
      <SegmentedControl
        role="radiogroup"
        ariaLabel="Cards"
        fullWidth
        anchor={tourAttr('flashcards-cards.mode')}
        options={options}
        value={value.mode}
        onChange={changeMode}
      />

      {value.mode === 'all' && (
        <p className="text-sm text-slate-600">
          Every student gets all {cardCount} cards.
        </p>
      )}

      {value.mode === 'random' && (
        <div>
          <div className={ROW_CLASS}>
            <label htmlFor="flashcards-cards-count" className={LABEL_CLASS}>
              Number of cards
            </label>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <input
                id="flashcards-cards-count"
                {...tourAttr('flashcards-cards.count')}
                type="number"
                min={1}
                max={Math.max(1, cardCount - 1)}
                step={1}
                value={value.count}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  if (Number.isFinite(n) && n > 0) {
                    onChange({
                      mode: 'random',
                      count: clampRandomCount(n, cardCount),
                    });
                  }
                }}
                className="h-8 w-16 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-hidden"
              />
              <span>of {cardCount}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Picked once when you assign. Every student gets the same cards.
          </p>
        </div>
      )}

      {value.mode === 'pick' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                {...tourAttr('flashcards-cards.search')}
                aria-label="Search cards"
                placeholder="Search cards"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 w-full rounded-lg border border-slate-300 bg-white pl-7 pr-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-hidden"
              />
            </div>
            <span className="shrink-0 text-xs font-bold text-slate-500">
              {picked.size} of {cardCount}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              {...tourAttr('flashcards-cards.select-all')}
              className={LINK_CLASS}
              disabled={picked.size === cardCount}
              onClick={() => setPicked(new Set(cards.map((c) => c.id)))}
            >
              Select all
            </button>
            <button
              type="button"
              {...tourAttr('flashcards-cards.clear')}
              className={LINK_CLASS}
              disabled={picked.size === 0}
              onClick={() => setPicked(new Set())}
            >
              Clear
            </button>
          </div>
          <ul
            {...tourAttr('flashcards-cards.list')}
            aria-label="Cards"
            className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 pb-1"
          >
            {visible.map((card) => {
              const id = `flashcards-pick-${card.id}`;
              return (
                <li key={card.id}>
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-slate-50"
                  >
                    <input
                      id={id}
                      type="checkbox" // no-tour-anchor: one row per card; the list carries the anchor
                      checked={picked.has(card.id)}
                      onChange={(event) =>
                        togglePick(card.id, event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800">
                        {card.term || 'Untitled card'}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {card.definition}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="px-3 py-3 text-sm text-slate-500">
                No cards match.
              </li>
            )}
          </ul>
          {picked.size === 0 && (
            <p role="alert" className="text-xs font-bold text-rose-600">
              Choose at least one card.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
