import type { FlashcardCard } from '@/types';

// Kept in memory so pasted cards never ride the board doc before the teacher saves.
const drafts = new Map<string, FlashcardCard[]>();

export const stashPastedFlashcards = (cards: FlashcardCard[]): string => {
  const id = crypto.randomUUID();
  drafts.set(id, cards);
  return id;
};

export const peekPastedFlashcards = (
  id: string | undefined
): FlashcardCard[] | null => (id ? (drafts.get(id) ?? null) : null);

export const clearPastedFlashcards = (id: string | undefined): void => {
  if (id) drafts.delete(id);
};
