import type { FlashcardCard } from '@/types';

const sameCard = (a: FlashcardCard, b: FlashcardCard): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** A Check's cards with the set's fixes applied: same ids and order, null when nothing changed. */
export const fixedCheckCards = (
  checkCards: FlashcardCard[],
  setCards: FlashcardCard[],
  speakStamped: boolean
): FlashcardCard[] | null => {
  const byId = new Map(setCards.map((card) => [card.id, card]));
  let changed = false;
  const next = checkCards.map((old) => {
    const fixed = byId.get(old.id);
    // A deleted card stays, so counts, saved answers and submissions still line up.
    if (!fixed) return old;
    const { speak, ...text } = fixed;
    let card: FlashcardCard = speakStamped && speak ? { ...text, speak } : text;
    // Readings for a fixed term are still being made: keep the old card until they land.
    if (speakStamped && old.speak && !speak) {
      if (fixed.term !== old.term) return old;
      card = { ...text, speak: old.speak };
    }
    if (sameCard(card, old)) return old;
    changed = true;
    return card;
  });
  return changed ? next : null;
};
