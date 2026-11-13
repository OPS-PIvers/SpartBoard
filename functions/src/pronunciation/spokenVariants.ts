// What a student may say for a card: its answer variants, with "el/la" and "mesero/a" spelled out, up to a few words each.
import {
  expandSlashWords,
  parseFlashcardAnswerVariants,
  spacedSlashSwapVariants,
} from '../flashcardMatch';

export const MAX_SPOKEN_WORDS = 4;
export const MAX_SPOKEN_VARIANTS = 4;

export interface SpokenVariants {
  texts: string[];
  /** Some variant was dropped for having more than MAX_SPOKEN_WORDS words. */
  tooManyWords: boolean;
}

const isWord = (w: string) => /[\p{L}\p{N}]/u.test(w);
const wordCount = (text: string) => text.split(' ').filter(isWord).length;

/** The texts Speak looks up for a term, in the order the term lists them. */
export function spokenVariants(
  term: string,
  language?: string
): SpokenVariants {
  const spanish = language === 'es';
  const texts: string[] = [];
  let tooManyWords = false;
  const listed = [
    ...parseFlashcardAnswerVariants(term),
    ...spacedSlashSwapVariants(term),
  ];
  for (const variant of listed) {
    // "Le traigo..." marks a blank the student skips; punctuation left on its own isn't said.
    const cleaned = variant
      .replace(/\.{2,}|…/gu, ' ')
      .split(/\s+/u)
      .filter(isWord)
      .join(' ');
    for (const text of expandSlashWords(cleaned, spanish)) {
      const words = wordCount(text);
      if (words === 0) continue;
      if (words > MAX_SPOKEN_WORDS) {
        tooManyWords = true;
        continue;
      }
      if (!texts.includes(text)) texts.push(text);
    }
  }
  return { texts: texts.slice(0, MAX_SPOKEN_VARIANTS), tooManyWords };
}

/** The variant a reference without `text` was looked up for (refs saved before phrases). */
export const firstVariant = (term: string): string =>
  parseFlashcardAnswerVariants(term)[0] ?? '';
