/**
 * PlcSearchBox — the per-PLC search box mounted in the PlcDashboard header
 * (PRD §6.4, Decision 4.3 — defer the ⌘K palette).
 *
 * A debounced text input with a grouped, keyboard-navigable results dropdown that
 * searches across the team's assessments, synced quizzes + video activities, shared
 * notes, Google docs, and shared boards. Matching + ranking is the pure
 * `searchPlcRecords` logic (see `plcSearchIndex.ts`); reading the loaded slices +
 * the on-demand boards query is the `usePlcSearch` selector (see `usePlcContext`).
 * Selecting a result navigates to that result's rail section.
 *
 * Accessibility (WCAG AA):
 *   - The input is an ARIA combobox (`role="combobox"`, `aria-expanded`,
 *     `aria-controls`, `aria-activedescendant`) over a `listbox` of `option`s.
 *   - Arrow Up/Down move the active option, Enter selects it, Escape closes.
 *   - Result count changes are announced via an `aria-live="polite"` region.
 *   - The input is `aria-label`led; the clear button has an `aria-label`.
 *
 * This lives on the PLC header's BLUE gradient surface, so the collapsed input uses
 * a translucent-white treatment; the open dropdown is a standard white card on the
 * light app surface and uses the light-surface text palette.
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ClipboardList,
  FileText,
  Film,
  LayoutDashboard,
  Loader2,
  Search,
  StickyNote,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useClickOutside } from '@/hooks/useClickOutside';
import { usePlcSearch } from '@/context/usePlcContext';
import type { PlcSectionId } from '@/components/plc/sections';
import type {
  PlcSearchKind,
  PlcSearchResult,
  PlcSearchSection,
} from './plcSearchIndex';

interface PlcSearchBoxProps {
  /** The active PLC's id — targets the on-demand boards subscription. */
  plcId: string;
  /** Navigate to a rail section (the dashboard's `handleNavigateSection`). */
  onNavigate: (section: PlcSectionId) => void;
}

/** Debounce window for the live query (calm; avoids re-ranking on every keypress). */
const SEARCH_DEBOUNCE_MS = 150;

/** Icon per searched-record kind. */
const KIND_ICONS: Record<PlcSearchKind, LucideIcon> = {
  assessment: ClipboardList,
  quiz: BookOpen,
  'video-activity': Film,
  doc: FileText,
  note: StickyNote,
  board: LayoutDashboard,
};

/** i18n key + default for each result group's section heading. */
const SECTION_HEADINGS: Record<
  PlcSearchSection,
  { key: string; defaultValue: string }
> = {
  assessments: {
    key: 'plcDashboard.search.groupAssessments',
    defaultValue: 'Assessments',
  },
  sharedData: { key: 'plcDashboard.search.groupData', defaultValue: 'Data' },
  docs: { key: 'plcDashboard.search.groupDocs', defaultValue: 'Notes & Docs' },
  sharedBoards: {
    key: 'plcDashboard.search.groupBoards',
    defaultValue: 'Boards',
  },
};

export const PlcSearchBox: React.FC<PlcSearchBoxProps> = ({
  plcId,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const { groups, flat, loadingBoards } = usePlcSearch(plcId, debouncedQuery);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const liveId = `${baseId}-live`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  // Clamp the active index whenever the result set shrinks/grows (computed during
  // render — no effect — per the house "adjusting state while rendering" rule).
  const clampedActiveIndex =
    flat.length === 0 ? 0 : Math.min(activeIndex, flat.length - 1);
  if (clampedActiveIndex !== activeIndex) setActiveIndex(clampedActiveIndex);

  // Show the dropdown only when focused/open AND the query is long enough to have
  // produced something (or boards are still loading for a long-enough query).
  const hasQuery = debouncedQuery.trim().length >= 2;
  const showDropdown = open && hasQuery;
  const showEmpty = showDropdown && flat.length === 0 && !loadingBoards;

  useClickOutside(containerRef, () => setOpen(false));

  // Stable map from flat index → result for keyboard selection.
  const flatByIndex = useMemo(() => flat, [flat]);

  const selectResult = (result: PlcSearchResult) => {
    onNavigate(result.section as PlcSectionId);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query) {
        setQuery('');
      } else {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    if (!showDropdown || flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = flatByIndex[clampedActiveIndex];
      if (result) selectResult(result);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(flat.length - 1);
    }
  };

  // The polite live-region message announcing the result count.
  const liveMessage = !hasQuery
    ? ''
    : loadingBoards && flat.length === 0
      ? t('plcDashboard.search.searching', { defaultValue: 'Searching…' })
      : t('plcDashboard.search.resultCount', {
          count: flat.length,
          defaultValue: '{{count}} result',
          defaultValue_other: '{{count}} results',
        });

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showDropdown && flat.length > 0
              ? optionId(clampedActiveIndex)
              : undefined
          }
          aria-label={t('plcDashboard.search.ariaLabel', {
            defaultValue: 'Search this PLC',
          })}
          placeholder={t('plcDashboard.search.placeholder', {
            defaultValue: 'Search this PLC…',
          })}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg bg-white/15 hover:bg-white/20 focus:bg-white/25 border border-white/20 focus:border-white/40 pl-8 pr-8 py-1.5 text-sm text-white placeholder:text-white/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(true);
              inputRef.current?.focus();
            }}
            aria-label={t('plcDashboard.search.clear', {
              defaultValue: 'Clear search',
            })}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/70 hover:text-white hover:bg-white/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Polite live region — announces result count to screen readers. */}
      <div id={liveId} role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 z-modal-content mt-1.5 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white text-left shadow-xl">
          {loadingBoards && flat.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {t('plcDashboard.search.searching', {
                defaultValue: 'Searching…',
              })}
            </div>
          ) : showEmpty ? (
            <div className="px-3 py-4 text-xs text-slate-500">
              {t('plcDashboard.search.noResults', {
                query: debouncedQuery.trim(),
                defaultValue: 'No matches for “{{query}}”',
              })}
            </div>
          ) : (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={t('plcDashboard.search.resultsLabel', {
                defaultValue: 'Search results',
              })}
              className="py-1"
            >
              {groups.map((group) => {
                const heading = SECTION_HEADINGS[group.section];
                return (
                  <li key={group.section} role="presentation">
                    <div
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400"
                    >
                      {t(heading.key, { defaultValue: heading.defaultValue })}
                    </div>
                    <ul role="presentation">
                      {group.results.map((result) => {
                        const flatIndex = flat.indexOf(result);
                        const isActive = flatIndex === clampedActiveIndex;
                        const Icon = KIND_ICONS[result.kind];
                        return (
                          <li
                            key={`${result.kind}-${result.id}`}
                            role="presentation"
                          >
                            <button
                              type="button"
                              id={optionId(flatIndex)}
                              role="option"
                              aria-selected={isActive}
                              onMouseDown={(e) => {
                                // Keep focus on the input (don't blur-close before
                                // the click handler runs).
                                e.preventDefault();
                                selectResult(result);
                              }}
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors focus:outline-none ${
                                isActive
                                  ? 'bg-brand-blue-primary/10'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <Icon
                                className="mt-0.5 w-4 h-4 shrink-0 text-slate-400"
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-slate-800">
                                  {result.title ||
                                    t('plcDashboard.search.untitled', {
                                      defaultValue: 'Untitled',
                                    })}
                                </span>
                                {result.matchedField === 'snippet' &&
                                  result.snippet && (
                                    <span className="mt-0.5 block truncate text-xxs text-slate-500">
                                      {result.snippet}
                                    </span>
                                  )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
