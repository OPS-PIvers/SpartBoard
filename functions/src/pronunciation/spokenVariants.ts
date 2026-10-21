// What a student may say for a card: its answer variants, with "el/la" and "mesero/a" spelled out, up to a few words each.
import { parseFlashcardAnswerVariants } from '../flashcardMatch';

export const MAX_SPOKEN_WORDS = 4;
export const MAX_SPOKEN_VARIANTS = 4;

export interface SpokenVariants {
  texts: string[];
  /** Some variant was dropped for having more than MAX_SPOKEN_WORDS words. */
  tooManyWords: boolean;
}

const SWAPPED_ENDING = /^[ao]s?$/u;

// "mesero/a" and "chicos/as" swap the ending; "profesor/a" and "flor/es" add it; "el/la" are whole words.
function slashOptions(word: string): string[] {
  const parts = word.split('/');
  if (parts.length < 2 || parts.some((p) => !/\p{L}/u.test(p))) return [word];
  const [first, ...rest] = parts;
  return [
    first,
    ...rest.map((part) => {
      if (part.length > 3 || first.length <= part.length + 1) return part;
      return SWAPPED_ENDING.test(part) &&
        SWAPPED_ENDING.test(first.slice(-part.length))
        ? first.slice(0, -part.length) + part
        : first + part;
    }),
  ];
}

// Slash words pair up by position ("el/la mesero/a" is el mesero, la mesera); a shorter list repeats its last option.
function expandSlashes(text: string): string[] {
  const words = text.split(' ').map(slashOptions);
  const longest = Math.max(...words.map((o) => o.length));
  return Array.from({ length: longest }, (_, i) =>
    words.map((o) => o[Math.min(i, o.length - 1)]).join(' ')
  );
}

const isWord = (w: string) => /[\p{L}\p{N}]/u.test(w);
const wordCount = (text: string) => text.split(' ').filter(isWord).length;

/** The texts Speak looks up for a term, in the order the term lists them. */
export function spokenVariants(term: string): SpokenVariants {
  const texts: string[] = [];
  let tooManyWords = false;
  for (const variant of parseFlashcardAnswerVariants(term)) {
    // "Le traigo..." marks a blank the student skips; punctuation left on its own isn't said.
    const cleaned = variant
      .replace(/\.{2,}|…/gu, ' ')
      .split(/\s+/u)
      .filter(isWord)
      .join(' ');
    for (const text of expandSlashes(cleaned)) {
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
