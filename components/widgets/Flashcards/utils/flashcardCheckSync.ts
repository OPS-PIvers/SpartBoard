import type { FlashcardCard } from '@/types';
import { stableStringify } from '@/utils/stableStringify';

/** Mirrors isSpeakableCard in functions/src/flashcardCheck.ts. */
const speakable = (card: FlashcardCard): boolean =>
  (card.speak?.refs ?? []).some(
    (ref) => Array.isArray(ref.tokens) && ref.tokens.length > 0
  );

const sameCard = (a: FlashcardCard, b: FlashcardCard): boolean =>
  stableStringify(a) === stableStringify(b);

/** A swap or a side cleared is a new card, not a fix, so it never reaches a Check. */
const side = (text: string): string => text.trim().toLowerCase();
const notAFix = (old: FlashcardCard, fixed: FlashcardCard): boolean =>
  (side(old.term) !== '' && side(fixed.term) === '') ||
  (side(old.definition) !== '' && side(fixed.definition) === '') ||
  (side(fixed.term) !== side(old.term) &&
    side(old.term) !== side(old.definition) &&
    (side(fixed.term) === side(old.definition) ||
      side(fixed.definition) === side(old.term)));

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
    if (notAFix(old, fixed)) return old;
    const { speak, ...text } = fixed;
    let card: FlashcardCard = speakStamped && speak ? { ...text, speak } : text;
    // Which cards can be spoken is fixed for the attempt, so a fix never changes it.
    if (speakStamped && speakable(card) !== speakable(old)) {
      if (fixed.term !== old.term) return old;
      card = old.speak ? { ...text, speak: old.speak } : text;
    }
    if (sameCard(card, old)) return old;
    changed = true;
    return card;
  });
  return changed ? next : null;
};
