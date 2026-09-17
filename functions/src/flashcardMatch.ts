// Mirrors utils/flashcardMatch.ts; functions cannot import the root package.
export type FlashcardMatchKind = 'exact' | 'accepted' | 'wrong';

export interface FlashcardDiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

export interface FlashcardMatch {
  result: FlashcardMatchKind;
  expected: string;
  diff: FlashcardDiffSegment[];
}

export interface FlashcardMatchOptions {
  language: string;
  strict: boolean;
}

const ARTICLES: Record<string, string[]> = {
  es: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'],
  fr: ['le', 'la', 'les', "l'", 'un', 'une', 'des'],
  de: [
    'der',
    'die',
    'das',
    'den',
    'dem',
    'des',
    'ein',
    'eine',
    'einen',
    'einem',
    'einer',
  ],
  it: ['il', 'lo', 'la', 'i', 'gli', 'le', "l'", 'un', 'uno', 'una', "un'"],
  pt: ['o', 'a', 'os', 'as', 'um', 'uma'],
};

const primaryLanguage = (language: string): string =>
  language.trim().toLocaleLowerCase().split('-')[0] ?? '';

const normalizeAlways = (value: string, language: string): string => {
  const normalized = value
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase(language || undefined)
    .replace(/[.,;:!?]+$/gu, '');
  return primaryLanguage(language) === 'ru'
    ? normalized.replace(/ё/gu, 'е')
    : normalized;
};

const stripDiacritics = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

const dropLeadingArticle = (value: string, language: string): string => {
  const articles = ARTICLES[primaryLanguage(language)] ?? [];
  for (const article of articles) {
    if (article.endsWith("'") && value.startsWith(article)) {
      return value.slice(article.length).trimStart();
    }
    if (value.startsWith(`${article} `)) {
      return value.slice(article.length + 1);
    }
  }
  return value;
};

const normalizeRelaxed = (value: string, language: string): string =>
  dropLeadingArticle(
    stripDiacritics(normalizeAlways(value, language)),
    language
  );

const expandOptional = (value: string): string[] => {
  const match = value.match(/\(([^()]*)\)/u);
  if (!match || match.index === undefined) return [value.trim()];
  const before = value.slice(0, match.index);
  const after = value.slice(match.index + match[0].length);
  const withOptional = `${before}${match[1] ?? ''}${after}`;
  const withoutOptional = `${before}${after}`;
  return [
    ...expandOptional(withOptional),
    ...expandOptional(withoutOptional),
  ].map((variant) => variant.replace(/\s+/gu, ' ').trim());
};

export const parseFlashcardAnswerVariants = (expected: string): string[] => {
  const variants = expected
    .split(/\s+\/\s+/u)
    .flatMap(expandOptional)
    .filter(Boolean);
  return [...new Set(variants.length > 0 ? variants : [expected.trim()])];
};

/** Optimal-string-alignment Damerau-Levenshtein distance. */
export const flashcardEditDistance = (left: string, right: string): number => {
  const a = Array.from(left);
  const b = Array.from(right);
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0)
  );
  for (let row = 0; row <= a.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= b.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const substitution = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitution
      );
      if (
        row > 1 &&
        column > 1 &&
        a[row - 1] === b[column - 2] &&
        a[row - 2] === b[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + 1
        );
      }
    }
  }
  return matrix[a.length][b.length];
};

const typoThreshold = (length: number): number => {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
};

const buildCharacterDiff = (
  response: string,
  expected: string
): FlashcardDiffSegment[] => {
  const left = Array.from(response);
  const right = Array.from(expected);
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0)
  );
  for (let row = left.length - 1; row >= 0; row -= 1) {
    for (let column = right.length - 1; column >= 0; column -= 1) {
      lengths[row][column] =
        left[row] === right[column]
          ? lengths[row + 1][column + 1] + 1
          : Math.max(lengths[row + 1][column], lengths[row][column + 1]);
    }
  }

  const raw: FlashcardDiffSegment[] = [];
  let row = 0;
  let column = 0;
  const append = (type: FlashcardDiffSegment['type'], text: string): void => {
    const previous = raw.at(-1);
    if (previous?.type === type) previous.text += text;
    else raw.push({ type, text });
  };

  while (row < left.length && column < right.length) {
    if (left[row] === right[column]) {
      append('equal', left[row] ?? '');
      row += 1;
      column += 1;
    } else if (lengths[row + 1][column] >= lengths[row][column + 1]) {
      append('removed', left[row] ?? '');
      row += 1;
    } else {
      append('added', right[column] ?? '');
      column += 1;
    }
  }
  while (row < left.length) {
    append('removed', left[row] ?? '');
    row += 1;
  }
  while (column < right.length) {
    append('added', right[column] ?? '');
    column += 1;
  }
  return raw;
};

export const matchFlashcardAnswer = (
  response: string,
  expected: string,
  { language, strict }: FlashcardMatchOptions
): FlashcardMatch => {
  const variants = parseFlashcardAnswerVariants(expected);
  const normalizedResponse = normalizeAlways(response, language);
  const exact = variants.find(
    (variant) => normalizeAlways(variant, language) === normalizedResponse
  );
  if (exact !== undefined) {
    return { result: 'exact', expected: exact, diff: [] };
  }

  const closest = variants.reduce(
    (best, variant) => {
      const distance = flashcardEditDistance(
        normalizedResponse,
        normalizeAlways(variant, language)
      );
      return distance < best.distance ? { variant, distance } : best;
    },
    { variant: variants[0] ?? expected, distance: Number.POSITIVE_INFINITY }
  );

  if (!strict) {
    const relaxedResponse = normalizeRelaxed(response, language);
    for (const variant of variants) {
      const relaxedExpected = normalizeRelaxed(variant, language);
      const distance = flashcardEditDistance(relaxedResponse, relaxedExpected);
      if (
        relaxedResponse === relaxedExpected ||
        distance <= typoThreshold(Array.from(relaxedExpected).length)
      ) {
        return {
          result: 'accepted',
          expected: variant,
          diff: buildCharacterDiff(response.trim(), variant),
        };
      }
    }
  }

  return {
    result: 'wrong',
    expected: closest.variant,
    diff: buildCharacterDiff(response.trim(), closest.variant),
  };
};
