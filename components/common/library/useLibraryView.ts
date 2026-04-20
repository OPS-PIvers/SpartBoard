import { useCallback, useMemo, useState } from 'react';
import type {
  LibrarySortDir,
  LibraryViewMode,
  UseLibraryViewOptions,
  UseLibraryViewResult,
} from './types';

const DEFAULT_LOCKED_REASON = 'Clear search and set sort to Manual to reorder.';

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
  } = options;

  const [search, setSearch] = useState<string>(initialSearch);
  const [sort, setSort] = useState<{ key: string; dir: LibrarySortDir }>(
    initialSort
  );
  const [viewMode, setViewMode] = useState<LibraryViewMode>(initialViewMode);
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

  const reorderLocked = search.trim() !== '' || sort.key !== 'manual';
  const reorderLockedReason = reorderLocked ? DEFAULT_LOCKED_REASON : undefined;

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
      onViewModeChange: setViewMode,
    }),
    [search, sort, filterValues, handleFilterChange, viewMode]
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
    state,
  };
}
