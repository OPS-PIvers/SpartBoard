import { createContext } from 'react';
import type { FlashcardProgress } from '@/types';

export type FlashcardProgressCount = Pick<
  FlashcardProgress,
  'classId' | 'submittedAt'
>;

/** Dev harness only: fixed progress for the Flashcards Assigned tab instead of live listeners. */
export const FlashcardProgressFixture = createContext<Record<
  string,
  FlashcardProgressCount[]
> | null>(null);
