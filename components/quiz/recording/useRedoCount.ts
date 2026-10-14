import { useCallback, useState } from 'react';

const storageKey = (key: string) => `quiz-redos:${key}`;

const read = (key: string | undefined): number => {
  if (!key) return 0;
  try {
    const n = Number(localStorage.getItem(storageKey(key)));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
};

/** Redos used on this question, kept in localStorage so leaving and returning can't refill attempts. */
export const useRedoCount = (key: string | undefined) => {
  const [redos, setRedos] = useState(() => read(key));
  const addRedo = useCallback(() => {
    setRedos((n) => {
      if (key) {
        try {
          localStorage.setItem(storageKey(key), String(n + 1));
        } catch {
          // Private mode or blocked storage: the count still holds for this visit.
        }
      }
      return n + 1;
    });
  }, [key]);
  return [redos, addRedo] as const;
};
