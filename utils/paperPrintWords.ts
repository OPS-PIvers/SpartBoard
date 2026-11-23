// The fixed words a printed test copy adds around stimuli, in the copy's language.

export interface PaperPrintWords {
  /** "Use Resource A." or "Use Resources A and B." */
  useResources: (letters: readonly string[]) => string;
  resource: (letter: string) => string;
  question: (row: string | number) => string;
  continued: (title: string) => string;
  writeOnSheet: string;
}

interface WordSet {
  use: (list: string, plural: boolean) => string;
  resource: string;
  question: string;
  continued: string;
  and: string;
  writeOnSheet: string;
}

const WORDS: Record<string, WordSet> = {
  en: {
    use: (l, p) => `Use ${p ? 'Resources' : 'Resource'} ${l}.`,
    resource: 'Resource',
    question: 'Question',
    continued: 'continued',
    and: 'and',
    writeOnSheet: 'Write your answer on your response sheet.',
  },
  es: {
    use: (l, p) => `Usa ${p ? 'los recursos' : 'el recurso'} ${l}.`,
    resource: 'Recurso',
    question: 'Pregunta',
    continued: 'continuación',
    and: 'y',
    writeOnSheet: 'Escribe tu respuesta en tu hoja de respuestas.',
  },
  so: {
    use: (l) => `Isticmaal Ilaha ${l}.`,
    resource: 'Ilaha',
    question: "Su'aasha",
    continued: 'sii socda',
    and: 'iyo',
    writeOnSheet: 'Ku qor jawaabtaada warqadda jawaabaha.',
  },
  hmn: {
    use: (l) => `Siv Ntaub Ntawv ${l}.`,
    resource: 'Ntaub Ntawv',
    question: 'Lo Lus Nug',
    continued: 'txuas ntxiv',
    and: 'thiab',
    writeOnSheet: 'Sau koj cov lus teb rau ntawm koj daim ntawv teb.',
  },
  ru: {
    use: (l, p) => `Используй ${p ? 'ресурсы' : 'ресурс'} ${l}.`,
    resource: 'Ресурс',
    question: 'Вопрос',
    continued: 'продолжение',
    and: 'и',
    writeOnSheet: 'Запиши ответ в своём бланке ответов.',
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
          : `${letters.slice(0, -1).join(', ')} ${w.and} ${letters[letters.length - 1]}`;
      return w.use(list, letters.length > 1);
    },
    resource: (letter) => `${w.resource} ${letter}`,
    question: (row) => `${w.question} ${row}`,
    continued: (title) => `${title} (${w.continued})`,
    writeOnSheet: w.writeOnSheet,
  };
}

export const ENGLISH_PRINT_WORDS = paperPrintWords();
