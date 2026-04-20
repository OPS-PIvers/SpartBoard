import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLibraryView } from '@/components/common/library/useLibraryView';
import type { LibrarySortDir } from '@/components/common/library/types';

interface Item {
  id: string;
  title: string;
  grade: string;
  order: number;
  createdAt: number;
}

const ITEMS: Item[] = [
  { id: 'a', title: 'Alpha Quiz', grade: 'K-2', order: 3, createdAt: 300 },
  { id: 'b', title: 'Bravo Quiz', grade: '3-5', order: 1, createdAt: 100 },
  { id: 'c', title: 'Charlie Test', grade: 'K-2', order: 2, createdAt: 200 },
];

const searchFields = (item: Item) => [item.title, item.grade];

const sortComparators = {
  manual: (a: Item, b: Item, dir: LibrarySortDir) => {
    const diff = a.order - b.order;
    return dir === 'asc' ? diff : -diff;
  },
  title: (a: Item, b: Item, dir: LibrarySortDir) => {
    const diff = a.title.localeCompare(b.title);
    return dir === 'asc' ? diff : -diff;
  },
  createdAt: (a: Item, b: Item, dir: LibrarySortDir) => {
    const diff = a.createdAt - b.createdAt;
    return dir === 'asc' ? diff : -diff;
  },
};

const filterPredicates = {
  grade: (item: Item, value: string) => item.grade === value,
  hasC: (item: Item, value: string) =>
    value === 'yes' ? item.title.toLowerCase().includes('c') : true,
};

const baseOptions = () => ({
  items: ITEMS,
  searchFields,
  sortComparators,
  filterPredicates,
});

describe('useLibraryView', () => {
  it('returns all items in manual order by default', () => {
    const { result } = renderHook(() => useLibraryView(baseOptions()));
    expect(result.current.visibleItems.map((i) => i.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(result.current.reorderLocked).toBe(false);
    expect(result.current.reorderLockedReason).toBeUndefined();
  });

  it('filters items by search substring (case-insensitive) across fields', () => {
    const { result } = renderHook(() => useLibraryView(baseOptions()));

    act(() => {
      result.current.toolbarProps.onSearchChange('QUIZ');
    });

    const ids = result.current.visibleItems.map((i) => i.id).sort();
    expect(ids).toEqual(['a', 'b']);

    act(() => {
      result.current.toolbarProps.onSearchChange('3-5');
    });

    expect(result.current.visibleItems.map((i) => i.id)).toEqual(['b']);
  });

  it('sorts ascending and descending for the same key', () => {
    const { result } = renderHook(() => useLibraryView(baseOptions()));

    act(() => {
      result.current.toolbarProps.onSortChange({ key: 'title', dir: 'asc' });
    });
    expect(result.current.visibleItems.map((i) => i.id)).toEqual([
      'a',
      'b',
      'c',
    ]);

    act(() => {
      result.current.toolbarProps.onSortChange({ key: 'title', dir: 'desc' });
    });
    expect(result.current.visibleItems.map((i) => i.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('AND-combines multiple active filters', () => {
    const { result } = renderHook(() => useLibraryView(baseOptions()));

    act(() => {
      result.current.toolbarProps.onFilterChange?.('grade', 'K-2');
    });
    expect(result.current.visibleItems.map((i) => i.id).sort()).toEqual([
      'a',
      'c',
    ]);

    act(() => {
      result.current.toolbarProps.onFilterChange?.('hasC', 'yes');
    });
    // grade=K-2 AND title contains "c" → only "Charlie Test"
    expect(result.current.visibleItems.map((i) => i.id)).toEqual(['c']);

    // Clearing a filter (empty string) removes it from active set.
    act(() => {
      result.current.toolbarProps.onFilterChange?.('grade', '');
    });
    expect(result.current.visibleItems.map((i) => i.id).sort()).toEqual(['c']);
  });

  it('reorder is unlocked when sort=manual and search is empty', () => {
    const { result } = renderHook(() => useLibraryView(baseOptions()));
    expect(result.current.reorderLocked).toBe(false);
  });

  it('reorder locks when search is non-empty', () => {
    const { result } = renderHook(() => useLibraryView(baseOptions()));
    act(() => {
      result.current.toolbarProps.onSearchChange('Alpha');
    });
    expect(result.current.reorderLocked).toBe(true);
    expect(result.current.reorderLockedReason).toBeDefined();
  });

  it('reorder locks when sort.key is not manual', () => {
    const { result } = renderHook(() => useLibraryView(baseOptions()));
    act(() => {
      result.current.toolbarProps.onSortChange({
        key: 'createdAt',
        dir: 'desc',
      });
    });
    expect(result.current.reorderLocked).toBe(true);
    expect(result.current.reorderLockedReason).toBeDefined();
  });

  it('visibleItems is referentially stable when inputs do not change', () => {
    const opts = baseOptions();
    const { result, rerender } = renderHook(() => useLibraryView(opts));
    const first = result.current.visibleItems;
    rerender();
    expect(result.current.visibleItems).toBe(first);
  });

  it('respects initial sort / search / filter values', () => {
    const { result } = renderHook(() =>
      useLibraryView({
        ...baseOptions(),
        initialSearch: 'quiz',
        initialSort: { key: 'title', dir: 'desc' },
        initialFilterValues: { grade: 'K-2' },
      })
    );
    // grade=K-2 AND title ~ "quiz" → only Alpha Quiz
    expect(result.current.visibleItems.map((i) => i.id)).toEqual(['a']);
    expect(result.current.reorderLocked).toBe(true);
  });
});
