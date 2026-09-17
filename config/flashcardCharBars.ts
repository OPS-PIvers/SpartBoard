const FLASHCARD_CHAR_BARS: Record<string, readonly string[]> = {
  es: ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¿', '¡'],
  fr: [
    'à',
    'â',
    'ç',
    'é',
    'è',
    'ê',
    'ë',
    'î',
    'ï',
    'ô',
    'ù',
    'û',
    'ü',
    'ÿ',
    'œ',
    'æ',
  ],
  de: ['ä', 'ö', 'ü', 'ß'],
  it: ['à', 'è', 'é', 'ì', 'ò', 'ù'],
  pt: ['á', 'â', 'ã', 'à', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú'],
};

const MAX_CHARACTERS = 24;
const ASCII_LETTER = /^[a-z]$/;
const SPECIAL_CHARACTER = /^[\p{Script=Latin}¿¡]$/u;

export const getFlashcardCharBar = (language: string): readonly string[] =>
  FLASHCARD_CHAR_BARS[
    language.trim().toLocaleLowerCase().split('-')[0] ?? ''
  ] ?? [];

// Language bar plus any special Latin characters used in the answers, so a mislabeled set still gets them.
export const getFlashcardAnswerCharacters = (
  language: string,
  answers: readonly string[]
): readonly string[] => {
  const base = getFlashcardCharBar(language);
  const found = new Set<string>();
  for (const answer of answers) {
    for (const character of answer.toLocaleLowerCase()) {
      if (SPECIAL_CHARACTER.test(character) && !ASCII_LETTER.test(character)) {
        found.add(character);
      }
    }
  }
  const extra = [...found]
    .filter((character) => !base.includes(character))
    .sort((a, b) => a.localeCompare(b));
  return [...base, ...extra].slice(0, MAX_CHARACTERS);
};

export const uppercaseFlashcardCharacter = (character: string): string =>
  character === 'ß' ? character : character.toLocaleUpperCase();
