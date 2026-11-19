// Fill-in-the-blank matching for students served a translation; mirrored in functions/src/quizFibMatch.ts.
import { flashcardEditDistance } from './flashcardMatch';

/** Extra accepted FIB answers; the object form turns on lenient matching of `answers` for that locale. */
export type FibExtras =
  | readonly string[]
  | {
      /** The translated key for the served locale. */
      answers: readonly string[];
      /** Teacher-accepted answers; always matched exactly. */
      exact?: readonly string[];
      lenientLocale?: string;
    };

export interface FibExtrasParts {
  answers: readonly string[];
  exact: readonly string[];
  lenientLocale?: string;
}

export function fibExtrasParts(extras: FibExtras | undefined): FibExtrasParts {
  if (!extras) return { answers: [], exact: [] };
  if (Array.isArray(extras))
    return { answers: extras as readonly string[], exact: [] };
  const obj = extras as Exclude<FibExtras, readonly string[]>;
  return {
    answers: obj.answers,
    exact: obj.exact ?? [],
    lenientLocale: obj.lenientLocale,
  };
}

const ARTICLES: Record<string, readonly string[]> = {
  en: ['the', 'an', 'a'],
  es: ['los', 'las', 'unos', 'unas', 'una', 'el', 'la', 'un'],
  fr: ['les', 'une', 'des', 'le', 'la', "l'", 'un'],
  de: [
    'der',
    'die',
    'das',
    'den',
    'dem',
    'des',
    'eine',
    'einen',
    'einem',
    'einer',
    'ein',
  ],
  it: ['gli', 'il', 'lo', 'la', 'le', "l'", 'uno', 'una', "un'", 'un', 'i'],
  pt: ['os', 'as', 'um', 'uma', 'o', 'a'],
};

const primary = (locale: string): string =>
  locale.trim().toLowerCase().split('-')[0] ?? '';

const dropArticle = (value: string, locale: string): string => {
  for (const article of ARTICLES[primary(locale)] ?? []) {
    if (article.endsWith("'") && value.startsWith(article))
      return value.slice(article.length).trimStart();
    if (value.startsWith(`${article} `)) return value.slice(article.length + 1);
  }
  return value;
};

/** Case, spacing, accents, end punctuation and one leading article never count. */
export function relaxFibAnswer(value: string, locale: string): string {
  const base = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[¿¡"“”]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.,;:!?]+$/u, '')
    .trim();
  return dropArticle(base, locale);
}

const NUMBER = /\d+(?:[.,]\d+)?/gu;

// "31,4" and "31.4" are the same number; neither ever costs a typo.
const canonicalNumbers = (value: string): string =>
  value.replace(NUMBER, (n) => n.replace(',', '.'));

/** The Flashcards rule: none up to 3 letters, 1 up to 6, then 2. */
const typoAllowance = (length: number): number =>
  length <= 3 ? 0 : length <= 6 ? 1 : 2;

/** True when `given` equals `key` once case, accents, end punctuation and one leading article are set aside. */
export function fibRelaxedEqual(
  given: string,
  key: string,
  locale: string
): boolean {
  const g = canonicalNumbers(relaxFibAnswer(given, locale));
  return g !== '' && g === canonicalNumbers(relaxFibAnswer(key, locale));
}

/** True when `given` matches the translated `key` for a student served `locale`, small typos allowed. */
export function fibLenientMatch(
  given: string,
  key: string,
  locale: string
): boolean {
  const g = canonicalNumbers(relaxFibAnswer(given, locale));
  const k = canonicalNumbers(relaxFibAnswer(key, locale));
  if (g === '' || k === '') return false;
  if (g === k) return true;
  // Numbers must be exact; only the letters around them may have a typo.
  const kn = k.match(NUMBER) ?? [];
  const gn = g.match(NUMBER) ?? [];
  if (kn.length !== gn.length || kn.some((n, i) => n !== gn[i])) return false;
  const letters = Array.from(k.replace(/[\d.,]/gu, '')).length;
  return flashcardEditDistance(g, k) <= typoAllowance(letters);
}

/** Lenient grading for one blank: relaxed on the quiz key, typo-tolerant on the translation, exact on accepted answers. */
export function fibLenientAccepts(
  given: string,
  keys: readonly string[],
  extras: FibExtrasParts,
  normalize: (s: string) => string
): boolean {
  const locale = extras.lenientLocale;
  if (!locale) return false;
  const t = normalize(given);
  if (t === '') return false;
  return (
    keys.some((k) => k.trim() !== '' && fibRelaxedEqual(given, k, 'en')) ||
    extras.answers.some(
      (k) => k.trim() !== '' && fibLenientMatch(given, k, locale)
    ) ||
    extras.exact.some((k) => k.trim() !== '' && normalize(k) === t)
  );
}
