import { useCallback, useMemo, useState } from 'react';

export interface UseMultiSelectResult {
  selectedIds: ReadonlySet<string>;
  isSelectMode: boolean;
  toggle: (id: string) => void;
  selectOnly: (id: string) => void;
  clearSelection: () => void;
}

export const useMultiSelect = (): UseMultiSelectResult => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectOnly = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return useMemo(
    () => ({
      selectedIds,
      isSelectMode: selectedIds.size > 0,
      toggle,
      selectOnly,
      clearSelection,
    }),
    [selectedIds, toggle, selectOnly, clearSelection]
  );
};
