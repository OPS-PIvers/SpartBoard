import { useCallback, useState } from 'react';

interface RedoRecord {
  redos: number;
  /** Turned-in takes when the count was written; fewer now means a teacher reset. */
  takes: number;
}

const storageKey = (key: string) => `quiz-redos:${key}`;
const EMPTY: RedoRecord = { redos: 0, takes: 0 };

const read = (key: string | undefined): RedoRecord => {
  if (!key) return EMPTY;
  try {
    const saved = JSON.parse(
      localStorage.getItem(storageKey(key)) ?? 'null'
    ) as Partial<RedoRecord> | null;
    if (typeof saved?.redos !== 'number' || typeof saved.takes !== 'number')
      return EMPTY;
    return { redos: Math.max(0, Math.floor(saved.redos)), takes: saved.takes };
  } catch {
    return EMPTY;
  }
};

/** Redos used on this question, kept in localStorage so leaving and returning can't refill attempts. */
export const useRedoCount = (key: string | undefined, takesCommitted = 0) => {
  const [record, setRecord] = useState(() => read(key));
  // Checked each render, so a count read before saved takes load isn't lost.
  const redos = takesCommitted < record.takes ? 0 : record.redos;
  const addRedo = useCallback(() => {
    const next = { redos: redos + 1, takes: takesCommitted };
    setRecord(next);
    if (!key) return;
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(next));
    } catch {
      // Private mode or blocked storage: the count still holds for this visit.
    }
  }, [key, redos, takesCommitted]);
  return [redos, addRedo] as const;
};
