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
const VOWEL_END = /[aeiouáéíóú]$/u;
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');

// A gendered or plural ending written after a slash, spelled out as Spanish writes it.
function withEnding(first: string, part: string): string {
  // "inglés/esa", "dormilón/ona": the ending restates the word's last letters.
  for (let k = Math.min(part.length, 3); k >= 2; k--) {
    if (plain(first.slice(-k)) === plain(part.slice(0, k))) {
      return first.slice(0, -k) + part;
    }
  }
  // "mesero/a", "chicos/as" swap the ending; "este/a" swaps its last vowel.
  if (
    SWAPPED_ENDING.test(part) &&
    SWAPPED_ENDING.test(first.slice(-part.length))
  ) {
    return first.slice(0, -part.length) + part;
  }
  if (part.length === 1 && VOWEL_END.test(part) && VOWEL_END.test(first)) {
    return first.slice(0, -1) + part;
  }
  // "profesor/a", "flor/es" add it; "francés/a" drops the accent the longer word no longer needs.
  const stem = /^[aeiou]/u.test(part)
    ? first.replace(
        /([áéíóú])([ns])$/u,
        (_, v: string, c: string) => plain(v) + c
      )
    : first;
  return stem + part;
}

// "el/la" are whole words; a short part after a longer word is an ending.
function slashOptions(word: string): string[] {
  const parts = word.split('/');
  if (parts.length < 2 || parts.some((p) => !/\p{L}/u.test(p))) return [word];
  const [first, ...rest] = parts;
  return [
    first,
    ...rest.map((part) =>
      part.length > 3 || first.length <= part.length + 1
        ? part
        : withEnding(first, part)
    ),
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
