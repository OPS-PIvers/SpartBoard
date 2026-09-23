import type { FlashcardSession } from '@/types';

export const FC_CONTENT_COLLECTION = 'content';
export const FC_CONTENT_DOC = 'cards';

/** `flashcard_sessions/{id}/content/cards`: what a per-period session hides until the period opens. */
export type FlashcardSessionContent = Pick<FlashcardSession, 'cards'>;

/** Folds the content doc into a per-period session; other sessions pass through unchanged. */
export function mergeFlashcardSessionContent<T extends FlashcardSession>(
  session: T,
  content: FlashcardSessionContent | null
): T {
  if (!session.cardsInContent || !content) return session;
  return {
    ...session,
    cards: Array.isArray(content.cards) ? content.cards : [],
  };
}
