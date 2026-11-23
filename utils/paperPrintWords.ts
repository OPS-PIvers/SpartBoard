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
  groupTitle: (group: PaperGroupKind) => string;
  groupInstruction: (
    group: PaperGroupKind,
    opts: GroupInstructionOpts
  ) => string;
}

export type PaperGroupKind = 'all' | 'match' | 'order';

export interface GroupInstructionOpts {
  across: boolean;
  unusedLetters: boolean;
  firstRow?: string;
}

interface GroupWords {
  titles: Record<PaperGroupKind, string>;
  all: string;
  match: string;
  unused: string;
  orderAcross: string;
  orderRows: (row: string) => string;
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
  group: GroupWords;
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
    group: {
      titles: { all: 'Select all', match: 'Match', order: 'Order' },
      all: 'Select all that apply.',
      match: 'Bubble one letter for each term.',
      unused: 'Some letters are not used.',
      orderAcross: 'Bubble where each step goes. 1 is first.',
      orderRows: (r) =>
        `Bubble the first step on row ${r}. Bubble the next step on each row after it.`,
    },
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
    group: {
      titles: { all: 'Selecciona todas', match: 'Relaciona', order: 'Ordena' },
      all: 'Selecciona todas las respuestas correctas.',
      match: 'Rellena una letra para cada término.',
      unused: 'Algunas letras no se usan.',
      orderAcross: 'Rellena el lugar de cada paso. El 1 es el primero.',
      orderRows: (r) =>
        `Rellena el primer paso en la fila ${r}. Rellena el paso siguiente en cada fila después.`,
    },
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
    group: {
      titles: {
        all: 'Dooro dhammaan',
        match: 'Isku aadi',
        order: 'Kala hormari',
      },
      all: 'Dooro dhammaan jawaabaha saxda ah.',
      match: 'Buuxi hal xaraf eray kasta.',
      unused: 'Xarfaha qaarkood lama isticmaalo.',
      orderAcross: 'Buuxi meesha tallaabo kasta gasho. 1 waa tan koowaad.',
      orderRows: (r) =>
        `Buuxi tallaabada koowaad safka ${r}. Buuxi tallaabada xigta saf kasta oo ka dambeeya.`,
    },
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
    group: {
      titles: {
        all: 'Xaiv txhua',
        match: 'Muab sib txuam',
        order: 'Muab txheeb',
      },
      all: 'Xaiv txhua cov lus teb uas yog.',
      match: 'Pleev ib tug tsiaj ntawv rau txhua lo lus.',
      unused: 'Muaj qee tus tsiaj ntawv tsis siv.',
      orderAcross: 'Pleev qhov chaw rau txhua kauj ruam. 1 yog thawj.',
      orderRows: (r) =>
        `Pleev thawj kauj ruam rau kab ${r}. Pleev kauj ruam tom ntej rau txhua kab tom qab.`,
    },
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
    group: {
      titles: {
        all: 'Выбери все',
        match: 'Сопоставь',
        order: 'Расставь по порядку',
      },
      all: 'Выбери все правильные ответы.',
      match: 'Закрась одну букву для каждого термина.',
      unused: 'Некоторые буквы не используются.',
      orderAcross: 'Закрась место каждого шага. 1 значит первый.',
      orderRows: (r) =>
        `Закрась первый шаг в строке ${r}. Закрась следующий шаг в каждой строке после неё.`,
    },
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
    groupTitle: (group) => w.group.titles[group],
    groupInstruction: (group, opts) => {
      if (group === 'all') return w.group.all;
      if (group === 'match') {
        return opts.unusedLetters
          ? `${w.group.match} ${w.group.unused}`
          : w.group.match;
      }
      return opts.across
        ? w.group.orderAcross
        : w.group.orderRows(opts.firstRow ?? '1');
    },
  };
}

export const ENGLISH_PRINT_WORDS = paperPrintWords();

/** The line under a grouped question's text: on the test paper and on a question-text sheet. */
export function paperGroupInstruction(
  group: PaperGroupKind,
  opts: GroupInstructionOpts,
  language?: string
): string {
  return paperPrintWords(language).groupInstruction(group, opts);
}
