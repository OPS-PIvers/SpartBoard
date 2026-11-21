/** What a finished phrase turns into. */
export type DictatedPhrase =
  { kind: 'text'; text: string } | { kind: 'undo' } | { kind: 'empty' };

export interface TextRuleOptions {
  /** Everything before the caret. */
  textBefore: string;
  /** App language code, such as `en` or `es`. */
  language: string;
  /** The engine punctuates on its own, so spoken punctuation stays as words. */
  punctuates: boolean;
}

type SpokenMark = readonly [pattern: string, mark: string];

// Longest phrases first so "punto y coma" wins over "punto".
const SPOKEN_MARKS: Readonly<Record<string, readonly SpokenMark[]>> = {
  en: [
    ['new paragraph', '\n\n'],
    ['new line', '\n'],
    ['newline', '\n'],
    ['question mark', '?'],
    ['exclamation point', '!'],
    ['exclamation mark', '!'],
    ['full stop', '.'],
    ['semi colon', ';'],
    ['semicolon', ';'],
    ['colon', ':'],
    ['comma', ','],
    ['period', '.'],
  ],
  es: [
    ['nuevo p[aá]rrafo', '\n\n'],
    ['punto y aparte', '.\n'],
    ['nueva l[ií]nea', '\n'],
    ['punto y coma', ';'],
    ['punto y seguido', '.'],
    ['punto final', '.'],
    ['dos puntos', ':'],
    ['(?:abrir|abre) (?:signo de )?interrogaci[oó]n', '¿'],
    ['(?:abrir|abre) (?:signo de )?exclamaci[oó]n', '¡'],
    ['(?:cerrar|cierra) (?:signo de )?interrogaci[oó]n', '?'],
    ['(?:cerrar|cierra) (?:signo de )?exclamaci[oó]n', '!'],
    ['signo de interrogaci[oó]n', '?'],
    ['signo de exclamaci[oó]n', '!'],
    ['punto', '.'],
    ['coma', ','],
  ],
  ru: [
    ['новый абзац', '\n\n'],
    ['новая строка', '\n'],
    ['вопросительный знак', '?'],
    ['восклицательный знак', '!'],
    ['точка с запятой', ';'],
    ['двоеточие', ':'],
    ['запятая', ','],
    ['точка', '.'],
  ],
};

const UNDO_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  en: ['undo that'],
  es: ['deshacer', 'deshacer eso', 'deshaz eso'],
  ru: ['отменить', 'отмени это'],
};

// "The class period" is a word, not a full stop.
const PERIOD_AS_WORD_AFTER = new Set([
  'a',
  'an',
  'the',
  'this',
  'that',
  'each',
  'every',
  'per',
  'class',
  'time',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'last',
  'next',
  'same',
  'long',
  'short',
  'brief',
  'whole',
]);

const NOT_WORD_BEFORE = "(?<![\\p{L}\\p{N}'’])";
const NOT_WORD_AFTER = '(?![\\p{L}\\p{N}])';

const baseLanguage = (code: string): string =>
  code.trim().toLowerCase().split('-')[0];

const markRegexCache = new Map<string, RegExp>();

function markRegex(language: string, marks: readonly SpokenMark[]): RegExp {
  const cached = markRegexCache.get(language);
  if (cached) return cached;
  const alternatives = marks
    .map(([pattern]) => `(${pattern.replace(/ /g, '\\s+')})`)
    .join('|');
  const built = new RegExp(
    `${NOT_WORD_BEFORE}(?:${alternatives})${NOT_WORD_AFTER}`,
    'giu'
  );
  markRegexCache.set(language, built);
  return built;
}

function lastWord(text: string): string {
  const match = /([\p{L}\p{N}'’]+)\s*$/u.exec(text);
  return match ? match[1].toLowerCase() : '';
}

function replaceSpokenMarks(text: string, language: string): string {
  const marks = SPOKEN_MARKS[language];
  if (!marks) return text;
  return text.replace(markRegex(language, marks), (...args: unknown[]) => {
    const match = String(args[0]);
    const index = args
      .slice(1, marks.length + 1)
      .findIndex((group) => typeof group === 'string');
    const offset = args[marks.length + 1];
    if (index < 0) return match;
    if (
      language === 'en' &&
      match.toLowerCase() === 'period' &&
      typeof offset === 'number' &&
      PERIOD_AS_WORD_AFTER.has(lastWord(text.slice(0, offset)))
    )
      return match;
    return ` ${marks[index][1]} `;
  });
}

function tidySpacing(text: string): string {
  return text
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ +([.,?!;:])/g, '$1')
    .replace(/([¿¡]) +/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/^ +| +$/g, '');
}

/** True when the next letter starts a sentence. */
export function startsSentence(textBefore: string): boolean {
  const before = textBefore.replace(/[ \t\u00a0]+$/, '');
  if (before === '') return true;
  return /(?:[.!?…]["'”’)\]]*|[\n¿¡])$/.test(before);
}

function capitaliseFirstLetter(text: string): string {
  return text.replace(
    /^([\s"'“‘(¿¡[]*)(\p{Ll})/u,
    (_all: string, lead: string, letter: string) =>
      `${lead}${letter.toUpperCase()}`
  );
}

function capitaliseSentences(text: string): string {
  return text.replace(
    /((?:[.!?…]["'”’)\]]*[ \t]+|\n|[¿¡])["'“‘(¿¡]*)(\p{Ll})/gu,
    (_all: string, lead: string, letter: string) =>
      `${lead}${letter.toUpperCase()}`
  );
}

const capitaliseEnglishI = (text: string): string =>
  text.replace(/(?<![\p{L}\p{N}'’.-])i(?![\p{L}\p{N}-]|\.\p{L})/gu, 'I');

function needsLeadingSpace(textBefore: string, text: string): boolean {
  if (textBefore === '') return false;
  if (/^[\s.,?!;:)\]}…]/.test(text)) return false;
  if (/[\s([{¿¡“‘]$/.test(textBefore)) return false;
  // A straight quote opens when it follows a space or starts the text.
  if (/(?:^|[\s([{])["']$/.test(textBefore)) return false;
  return true;
}

function isUndoCommand(phrase: string, language: string): boolean {
  const said = phrase
    .toLowerCase()
    .replace(/[.,?!;:…]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (UNDO_COMMANDS[language] ?? []).includes(said);
}

/** Turn a raw finished phrase into text ready to insert at the caret. */
export function applyTextRules(
  raw: string,
  options: TextRuleOptions
): DictatedPhrase {
  const language = baseLanguage(options.language);
  const phrase = raw.replace(/\s+/g, ' ').trim();
  if (phrase === '') return { kind: 'empty' };
  if (isUndoCommand(phrase, language)) return { kind: 'undo' };

  let text = options.punctuates ? phrase : replaceSpokenMarks(phrase, language);
  text = tidySpacing(text);
  if (text === '') return { kind: 'empty' };

  if (startsSentence(options.textBefore)) text = capitaliseFirstLetter(text);
  text = capitaliseSentences(text);
  if (language === 'en') text = capitaliseEnglishI(text);
  if (needsLeadingSpace(options.textBefore, text)) text = ` ${text}`;
  return { kind: 'text', text };
}
