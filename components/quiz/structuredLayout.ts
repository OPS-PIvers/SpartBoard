import type { QuizPublicQuestion } from '@/types';

/** Matching/Ordering lists at least this long put the word bank in a column beside the list on wide screens. */
export const SIDE_BANK_MIN_ITEMS = 5;

/** True when a Matching or Ordering question is long enough to keep its word bank beside the list. */
export function hasSideBank(question: QuizPublicQuestion): boolean {
  const count =
    question.type === 'Matching'
      ? (question.matchingLeft?.length ?? 0)
      : question.type === 'Ordering'
        ? (question.orderingItems?.length ?? 0)
        : 0;
  return count >= SIDE_BANK_MIN_ITEMS;
}

/** Wrapper and bank classes for the side-by-side layout (lg and up only). */
export const SIDE_BANK_WRAPPER =
  'lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0';
export const SIDE_BANK_PANEL =
  'lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto';
