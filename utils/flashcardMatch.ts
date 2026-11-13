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

const MAX_OPTIONAL_VARIANTS = 64;

const expandOptional = (value: string): string[] => {
  let variants = [value];
  for (;;) {
    const next: string[] = [];
    let expanded = false;
    for (const variant of variants) {
      const match = variant.match(/\(([^()]*)\)/u);
      if (!match || match.index === undefined) {
        next.push(variant);
        continue;
      }
      expanded = true;
      const before = variant.slice(0, match.index);
      const after = variant.slice(match.index + match[0].length);
      next.push(`${before}${match[1] ?? ''}${after}`);
      // Past the cap, later optional groups are treated as required.
      if (variants.length * 2 <= MAX_OPTIONAL_VARIANTS) {
        next.push(`${before}${after}`);
      }
    }
    variants = next;
    if (!expanded) break;
  }
  return variants.map((variant) => variant.replace(/\s+/gu, ' ').trim());
};

export const parseFlashcardAnswerVariants = (expected: string): string[] => {
  const variants = expected
    .split(/\s+\/\s+/u)
    .flatMap(expandOptional)
    .filter(Boolean);
  return [...new Set(variants.length > 0 ? variants : [expected.trim()])];
};

const SWAPPED_ENDING = /^[ao]s?$/u;
const WORD_ENDING = /[ao]s?$/u;
const PLURAL_WORD_ENDING = /[aeo]s?$/u;
const VOWEL_END = /[aeiouáéíóú]$/u;
const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '');

// A gendered or plural ending written after a slash, spelled out as Spanish writes it.
const withEnding = (first: string, part: string): string => {
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
};

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
const slashOptions = (word: string, spanish: boolean): string[] => {
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
};

/** Slash words pair up by position ("el/la mesero/a" is el mesero, la mesera); a shorter list repeats its last option. */
export const expandSlashWords = (text: string, spanish: boolean): string[] => {
  const words = text.split(' ').map((word) => slashOptions(word, spanish));
  const longest = Math.max(...words.map((o) => o.length));
  return Array.from({ length: longest }, (_, i) =>
    words.map((o) => o[Math.min(i, o.length - 1)]).join(' ')
  );
};

const wordsOf = (text: string): string[] => text.split(/\s+/u).filter(Boolean);

// Infinitive markers and articles that can lead either side of a one-word swap.
const SHARED_LEADS = new Set([
  'to',
  'a',
  'an',
  'the',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'le',
  'les',
  'une',
]);

/** "sacar una buena / mala nota" and "to start / begin" also mean the whole phrase with either word. */
export const spacedSlashSwaps = (expected: string): string[] => {
  const parts = expected
    .trim()
    .split(/\s+\/\s+/u)
    .map(wordsOf);
  if (parts.length !== 2) return [];
  const [left, right] = parts;
  // Splice only around shared words: a tail ("buena / mala nota") or a short lead ("to start / begin").
  if (left.length <= right.length) return [];
  const withHead = [...left.slice(0, -1), ...right].join(' ');
  if (right.length === 1) {
    const lead = left.slice(0, -1);
    return lead.every((word) => SHARED_LEADS.has(word.toLowerCase()))
      ? [withHead]
      : [];
  }
  return [[...left, ...right.slice(1)].join(' '), withHead];
};

// "km/h" and "y/o" stay whole: a one-letter option is a unit or symbol, not a word.
const spellOutSlashes = (variant: string, spanish: boolean): string[] => {
  const source = variant.split(' ');
  const options = expandSlashWords(variant, spanish);
  const loneLetter = options.some((text) =>
    text
      .split(' ')
      .some(
        (word, index) =>
          source[index]?.includes('/') &&
          word.replace(/[^\p{L}]/gu, '').length === 1
      )
  );
  return loneLetter ? [] : options;
};

/** Whole-phrase swaps with their optional "(words)" spelled out. */
export const spacedSlashSwapVariants = (expected: string): string[] =>
  spacedSlashSwaps(expected).flatMap(expandOptional).filter(Boolean);

/** Every answer a typed response may match: the listed alternates, whole-phrase swaps, then "el/la doctor/a" spelled out. */
export const flashcardAnswerVariants = (
  expected: string,
  language = ''
): string[] => {
  const spanish = primaryLanguage(language) === 'es';
  const listed = [
    ...parseFlashcardAnswerVariants(expected),
    ...spacedSlashSwapVariants(expected),
  ];
  const variants = listed.flatMap((variant) =>
    variant.includes('/')
      ? [...spellOutSlashes(variant, spanish), variant]
      : [variant]
  );
  return [...new Set(variants)];
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
  const variants = flashcardAnswerVariants(expected, language);
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
