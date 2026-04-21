import { useCallback, useMemo, useState } from 'react';

export interface LibrarySelectionApi {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
  selectAll: (ids: string[]) => void;
  count: number;
}

export function useLibrarySelection(): LibrarySelectionApi {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  return useMemo(
    () => ({
      selectedIds,
      isSelected,
      toggle,
      clear,
      selectAll,
      count: selectedIds.size,
    }),
    [selectedIds, isSelected, toggle, clear, selectAll]
  );
}
