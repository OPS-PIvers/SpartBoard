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
const WORD_ENDING = /[ao]s?$/u;
const PLURAL_WORD_ENDING = /[aeo]s?$/u;
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
  // "mesero/a", "amigo/os", "este/os", "chicos/as" swap the ending; "este/a" swaps its last vowel.
  const wordEnding = part.endsWith('s') ? PLURAL_WORD_ENDING : WORD_ENDING;
  if (SWAPPED_ENDING.test(part) && wordEnding.test(first)) {
    return first.replace(wordEnding, part);
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

// Short words a slash part can stand beside without being an ending ("de/a", "nos/os").
const WHOLE_WORDS = new Set([
  'de',
  'en',
  'se',
  'te',
  'me',
  'le',
  'les',
  'nos',
  'os',
  'vos',
]);

// "os" after "ese", "a" after "un", "as" after "los" are endings even though the words are about as long.
const isEnding = (first: string, part: string, spanish: boolean): boolean =>
  part.length <= 3 &&
  (first.length > part.length + 1 ||
    (spanish &&
      SWAPPED_ENDING.test(part) &&
      first.length > part.length &&
      !WHOLE_WORDS.has(first.toLowerCase())));

// "el/la" are whole words; a short part after a longer word is an ending. "¡Bienvenido/a!" keeps its marks on every option.
function slashOptions(word: string, spanish: boolean): string[] {
  const [, lead, core, trail] =
    /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su.exec(word) ?? [
      '',
      '',
      word,
      '',
    ];
  const parts = core.split('/');
  if (parts.length < 2 || parts.some((p) => !/\p{L}/u.test(p))) return [word];
  const [first, ...rest] = parts;
  return [
    first,
    ...rest.map((part) =>
      isEnding(first, part, spanish) ? withEnding(first, part) : part
    ),
  ].map((option) => lead + option + trail);
}

// Slash words pair up by position ("el/la mesero/a" is el mesero, la mesera); a shorter list repeats its last option.
function expandSlashes(text: string, spanish: boolean): string[] {
  const words = text.split(' ').map((word) => slashOptions(word, spanish));
  const longest = Math.max(...words.map((o) => o.length));
  return Array.from({ length: longest }, (_, i) =>
    words.map((o) => o[Math.min(i, o.length - 1)]).join(' ')
  );
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
  for (const variant of parseFlashcardAnswerVariants(term)) {
    // "Le traigo..." marks a blank the student skips; punctuation left on its own isn't said.
    const cleaned = variant
      .replace(/\.{2,}|…/gu, ' ')
      .split(/\s+/u)
      .filter(isWord)
      .join(' ');
    for (const text of expandSlashes(cleaned, spanish)) {
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
