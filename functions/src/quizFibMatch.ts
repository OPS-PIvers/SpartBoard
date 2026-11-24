// Mirrors utils/quizFibMatch.ts; functions cannot import the root package.
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

// A backwards scan, not /[.,;:!?]+$/ (quadratic on a long run of punctuation).
const trimEndPunctuation = (value: string): string => {
  let end = value.length;
  while (end > 0 && '.,;:!?'.includes(value[end - 1])) end--;
  return value.slice(0, end);
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
    .trim();
  return dropArticle(trimEndPunctuation(base).trim(), locale);
}

const NUMBER = /[-−+]?\d+(?:[.,/]\d+)?/gu;

// "31,4" and "31.4" (and U+2212 minus vs "-") are the same number; neither ever costs a typo.
const canonicalNumbers = (value: string): string =>
  value.replace(NUMBER, (n) => n.replace(',', '.').replace('−', '-'));

/** One wrong letter from 4 letters up; two would let near neighbours like mitosis and meiosis through. */
const typoAllowance = (length: number): number => (length <= 3 ? 0 : 1);

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
  const letters = Array.from(k.replace(NUMBER, '')).length;
  const allowance = typoAllowance(letters);
  // The edit distance is never below the length gap, so skip the full matrix for a far-off length.
  if (Math.abs(Array.from(g).length - Array.from(k).length) > allowance)
    return false;
  return flashcardEditDistance(g, k) <= allowance;
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
  // Anything the exact path accepts stays accepted, including punctuation-only keys.
  if (
    [...keys, ...extras.answers, ...extras.exact].some(
      (k) => normalize(k) === t
    )
  )
    return true;
  return (
    keys.some((k) => k.trim() !== '' && fibRelaxedEqual(given, k, 'en')) ||
    extras.answers.some(
      (k) => k.trim() !== '' && fibLenientMatch(given, k, locale)
    ) ||
    extras.exact.some((k) => k.trim() !== '' && normalize(k) === t)
  );
}
