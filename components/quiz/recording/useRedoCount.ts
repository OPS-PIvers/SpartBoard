import { useCallback, useState } from 'react';

const storageKey = (key: string) => `quiz-redos:${key}`;

// Stored with the committed-take count it was written at, so a teacher reset (fewer takes) clears it.
const read = (key: string | undefined, takesCommitted: number): number => {
  if (!key) return 0;
  try {
    const saved = JSON.parse(
      localStorage.getItem(storageKey(key)) ?? 'null'
    ) as {
      redos?: unknown;
      takes?: unknown;
    } | null;
    if (
      typeof saved?.redos !== 'number' ||
      typeof saved.takes !== 'number' ||
      takesCommitted < saved.takes
    )
      return 0;
    return Math.max(0, Math.floor(saved.redos));
  } catch {
    return 0;
  }
};

/** Redos used on this question, kept in localStorage so leaving and returning can't refill attempts. */
export const useRedoCount = (key: string | undefined, takesCommitted = 0) => {
  const [redos, setRedos] = useState(() => read(key, takesCommitted));
  const addRedo = useCallback(() => {
    const next = redos + 1;
    setRedos(next);
    if (!key) return;
    try {
      localStorage.setItem(
        storageKey(key),
        JSON.stringify({ redos: next, takes: takesCommitted })
      );
    } catch {
      // Private mode or blocked storage: the count still holds for this visit.
    }
  }, [key, redos, takesCommitted]);
  return [redos, addRedo] as const;
};
