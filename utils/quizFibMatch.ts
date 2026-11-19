// Fill-in-the-blank matching for students served a translation; mirrored in functions/src/quizFibMatch.ts.
import { flashcardEditDistance } from './flashcardMatch';

/** Extra accepted FIB answers; the object form also turns on lenient matching for that locale. */
export type FibExtras =
  readonly string[] | { answers: readonly string[]; lenientLocale?: string };

export function fibExtrasParts(extras: FibExtras | undefined): {
  answers: readonly string[];
  lenientLocale?: string;
} {
  if (!extras) return { answers: [] };
  return Array.isArray(extras)
    ? { answers: extras as readonly string[] }
    : (extras as { answers: readonly string[]; lenientLocale?: string });
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
  for (const article of [
    ...(ARTICLES[primary(locale)] ?? []),
    ...ARTICLES.en,
  ]) {
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

const numbersIn = (value: string): string[] =>
  (value.match(/\d+(?:[.,]\d+)?/gu) ?? []).map((n) => n.replace(',', '.'));

/** The Flashcards rule: none up to 3 letters, 1 up to 6, then 2. */
const typoAllowance = (length: number): number =>
  length <= 3 ? 0 : length <= 6 ? 1 : 2;

/** True when `given` matches `key` for a student served a translation in `locale`. */
export function fibLenientMatch(
  given: string,
  key: string,
  locale: string
): boolean {
  const g = relaxFibAnswer(given, locale);
  const k = relaxFibAnswer(key, locale);
  if (g === '' || k === '') return false;
  if (g === k) return true;
  // Numbers must be exact; only the letters around them may have a typo.
  const kn = numbersIn(k);
  const gn = numbersIn(g);
  if (kn.length !== gn.length || kn.some((n, i) => n !== gn[i])) return false;
  const letters = Array.from(k.replace(/[\d.,]/gu, '')).length;
  return flashcardEditDistance(g, k) <= typoAllowance(letters);
}
