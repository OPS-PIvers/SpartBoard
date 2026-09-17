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
};

export const getFlashcardCharBar = (language: string): readonly string[] =>
  FLASHCARD_CHAR_BARS[
    language.trim().toLocaleLowerCase().split('-')[0] ?? ''
  ] ?? [];

export const uppercaseFlashcardCharacter = (character: string): string =>
  character === 'ß' ? character : character.toLocaleUpperCase();
