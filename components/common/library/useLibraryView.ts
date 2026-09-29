import { useCallback, useMemo, useState } from 'react';
import type {
  LibrarySortDir,
  LibraryViewMode,
  UseLibraryViewOptions,
  UseLibraryViewResult,
} from './types';

const DEFAULT_LOCKED_REASON = 'Clear search and set sort to Manual to reorder.';
const SEARCH_LOCKED_REASON = 'Clear search to reorder.';

export function useLibraryView<TItem>(
  options: UseLibraryViewOptions<TItem>
): UseLibraryViewResult<TItem> {
  const {
    items,
    initialSearch = '',
    initialSort = { key: 'manual', dir: 'asc' },
    initialViewMode = 'grid',
    initialFilterValues = {},
    searchFields,
    sortComparators,
    filterPredicates,
    onViewModeChange,
  } = options;

  const [search, setSearch] = useState<string>(initialSearch);
  const [sort, setSort] = useState<{ key: string; dir: LibrarySortDir }>(
    initialSort
  );
  const [viewMode, setViewModeState] =
    useState<LibraryViewMode>(initialViewMode);
  const handleViewModeChange = useCallback(
    (next: LibraryViewMode) => {
      setViewModeState((prev) => {
        // Only notify the consumer when the mode actually changes. Without
        // this guard, clicking the active view-mode button would trigger a
        // redundant Firestore write from every consumer that persists this.
        if (prev !== next) {
          onViewModeChange?.(next);
        }
        return next;
      });
    },
    [onViewModeChange]
  );
  const [filterValues, setFilterValues] =
    useState<Record<string, string>>(initialFilterValues);

  const visibleItems = useMemo<TItem[]>(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const activeFilters = filterPredicates
      ? Object.entries(filterValues).filter(
          ([id, value]) => value !== '' && filterPredicates[id] != null
        )
      : [];

    const filtered = items.filter((item) => {
      if (normalizedSearch !== '') {
        const raw = searchFields(item);
        const haystacks = Array.isArray(raw) ? raw : [raw];
        const matches = haystacks.some((field) =>
          (field ?? '').toLowerCase().includes(normalizedSearch)
        );
        if (!matches) return false;
      }
      for (const [id, value] of activeFilters) {
        const predicate = filterPredicates?.[id];
        if (predicate && !predicate(item, value)) return false;
      }
      return true;
    });

    const comparator = sortComparators[sort.key];
    if (!comparator) return filtered;
    // Copy before sort so we never mutate the input array.
    return [...filtered].sort((a, b) => comparator(a, b, sort.dir));
  }, [
    items,
    search,
    sort,
    filterValues,
    searchFields,
    sortComparators,
    filterPredicates,
  ]);

  // A drop while sorted by another key switches to Manual (see prepareReorder).
  const hasManualSort = sortComparators.manual != null;
  const searchActive = search.trim() !== '';
  const reorderLocked =
    searchActive || (sort.key !== 'manual' && !hasManualSort);
  const reorderLockedReason = !reorderLocked
    ? undefined
    : searchActive
      ? SEARCH_LOCKED_REASON
      : DEFAULT_LOCKED_REASON;

  const prepareReorder = useCallback((): boolean => {
    if (reorderLocked) return false;
    setSort((prev) =>
      prev.key === 'manual' ? prev : { key: 'manual', dir: 'asc' }
    );
    return true;
  }, [reorderLocked]);

  const handleFilterChange = useCallback((id: string, value: string) => {
    setFilterValues((prev) => {
      if (prev[id] === value) return prev;
      const next = { ...prev, [id]: value };
      if (value === '') delete next[id];
      return next;
    });
  }, []);

  const toolbarProps = useMemo<UseLibraryViewResult<TItem>['toolbarProps']>(
    () => ({
      search,
      onSearchChange: setSearch,
      sort,
      onSortChange: setSort,
      filterValues,
      onFilterChange: handleFilterChange,
      viewMode,
      onViewModeChange: handleViewModeChange,
    }),
    [
      search,
      sort,
      filterValues,
      handleFilterChange,
      viewMode,
      handleViewModeChange,
    ]
  );

  const state = useMemo(
    () => ({ search, sort, viewMode, filterValues }),
    [search, sort, viewMode, filterValues]
  );

  return {
    visibleItems,
    toolbarProps,
    reorderLocked,
    reorderLockedReason,
    prepareReorder,
    state,
  };
}
