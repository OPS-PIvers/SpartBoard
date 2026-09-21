import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { QuizScoreVisibility } from '@/types';

/** Per-student publishing callbacks, bound to one assignment by the widget. */
export interface StudentResultsActions {
  publish: (
    responseKeys: string[],
    visibility: Exclude<QuizScoreVisibility, 'none'>,
    expiresAt: number | null
  ) => Promise<{ responsesUpdated: number; skipped: number }>;
  hide: (responseKeys: string[]) => Promise<void>;
  clear: (responseKeys: string[]) => Promise<void>;
}

/** Response keys the teacher has picked in Results, shared across screens. */
export interface StudentResultsSelection {
  selectedResponseKeys: ReadonlySet<string>;
  toggle: (responseKey: string) => void;
  addToSelection: (responseKeys: Iterable<string>) => void;
  setSelection: (responseKeys: Iterable<string>) => void;
  clearSelection: () => void;
}

export const StudentResultsSelectionContext =
  createContext<StudentResultsSelection | null>(null);

/** Null outside Results or when no per-student publishing handlers were provided. */
export const useStudentResultsSelection = (): StudentResultsSelection | null =>
  useContext(StudentResultsSelectionContext);

export const useStudentResultsSelectionState = (): StudentResultsSelection => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const addToSelection = useCallback((keys: Iterable<string>) => {
    setSelected((prev) => new Set([...prev, ...keys]));
  }, []);
  const setSelection = useCallback((keys: Iterable<string>) => {
    setSelected(new Set(keys));
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  return useMemo(
    () => ({
      selectedResponseKeys: selected,
      toggle,
      addToSelection,
      setSelection,
      clearSelection,
    }),
    [selected, toggle, addToSelection, setSelection, clearSelection]
  );
};
