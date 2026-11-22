import { createContext } from 'react';

/** Puts a tapped word bank choice in the current answer; null where tapping does nothing. */
export const WordBankFillContext = createContext<
  ((choice: string) => void) | null
>(null);
