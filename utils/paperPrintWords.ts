// The fixed words a printed test copy adds around stimuli, in the copy's language.

export interface PaperPrintWords {
  /** "Use Resource A." or "Use Resources A and B." */
  useResources: (letters: readonly string[]) => string;
  resource: (letter: string) => string;
  question: (row: string | number) => string;
  continued: (title: string) => string;
  writeOnSheet: string;
  name: string;
  className: string;
}

interface WordSet {
  use: (list: string, plural: boolean) => string;
  resource: string;
  question: string;
  continued: string;
  and: (next: string) => string;
  writeOnSheet: string;
  name: string;
  className: string;
}

const WORDS: Record<string, WordSet> = {
  en: {
    use: (l, p) => `Use ${p ? 'Resources' : 'Resource'} ${l}.`,
    resource: 'Resource',
    question: 'Question',
    continued: 'continued',
    and: () => 'and',
    writeOnSheet: 'Write your answer on your response sheet.',
    name: 'Name',
    className: 'Class',
  },
  es: {
    use: (l, p) => `Usa ${p ? 'los recursos' : 'el recurso'} ${l}.`,
    resource: 'Recurso',
    question: 'Pregunta',
    continued: 'continuación',
    and: (next) => (/^i/i.test(next) ? 'e' : 'y'),
    writeOnSheet: 'Escribe tu respuesta en tu hoja de respuestas.',
    name: 'Nombre',
    className: 'Clase',
  },
  so: {
    use: (l, p) => `Isticmaal ${p ? 'Ilaha' : 'Isha'} ${l}.`,
    resource: 'Isha',
    question: "Su'aal",
    continued: 'sii socda',
    and: () => 'iyo',
    writeOnSheet: 'Ku qor jawaabtaada warqadda jawaabaha.',
    name: 'Magaca',
    className: 'Fasalka',
  },
  hmn: {
    use: (l) => `Siv Ntaub Ntawv ${l}.`,
    resource: 'Ntaub Ntawv',
    question: 'Lo Lus Nug',
    continued: 'txuas ntxiv',
    and: () => 'thiab',
    writeOnSheet: 'Sau koj cov lus teb rau ntawm koj daim ntawv teb.',
    name: 'Npe',
    className: 'Chav Kawm',
  },
  ru: {
    use: (l, p) => `Используй ${p ? 'источники' : 'источник'} ${l}.`,
    resource: 'Источник',
    question: 'Вопрос',
    continued: 'продолжение',
    and: () => 'и',
    writeOnSheet: 'Запиши ответ на бланке ответов.',
    name: 'Имя',
    className: 'Класс',
  },
};

/** The words for a language code such as 'es' or 'es-MX'; English when unknown. */
export function paperPrintWords(language?: string): PaperPrintWords {
  const code = language?.toLowerCase() ?? 'en';
  const w = WORDS[code] ?? WORDS[code.split('-')[0]] ?? WORDS.en;
  return {
    useResources: (letters) => {
      if (letters.length === 0) return '';
      const list =
        letters.length === 1
          ? letters[0]
          : `${letters.slice(0, -1).join(', ')} ${w.and(letters[letters.length - 1])} ${letters[letters.length - 1]}`;
      return w.use(list, letters.length > 1);
    },
    resource: (letter) => `${w.resource} ${letter}`,
    question: (row) => `${w.question} ${row}`,
    continued: (title) => `${title} (${w.continued})`,
    writeOnSheet: w.writeOnSheet,
    name: w.name,
    className: w.className,
  };
}

export const ENGLISH_PRINT_WORDS = paperPrintWords();

/** Titles over a grouped question's rows on a sheet without question text. */
export const PAPER_GROUP_TITLES = {
  all: 'Select all',
  match: 'Match',
  order: 'Order',
} as const;

/** The line under a grouped question's text: on the test paper and on a question-text sheet. */
export function paperGroupInstruction(
  group: 'all' | 'match' | 'order',
  opts: { across: boolean; unusedLetters: boolean; firstRow?: string }
): string {
  if (group === 'all') return 'Select all that apply.';
  if (group === 'match') {
    return opts.unusedLetters
      ? 'Bubble one letter for each term. Some letters are not used.'
      : 'Bubble one letter for each term.';
  }
  return opts.across
    ? 'Bubble where each step goes. 1 is first.'
    : `Bubble the first step on row ${opts.firstRow ?? '1'}. Bubble the next step on each row after it.`;
}
