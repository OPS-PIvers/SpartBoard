import {
  flashcardAnswerVariants,
  spacedSlashSwapVariants,
} from './flashcardMatch';

const ROW_SEPARATOR = /\s+\/\s+/u;
const COMPACT_SLASH = /\p{L}\/\p{L}/u;

/** A card side's accepted answers, one per row; the first is the one students see first. */
export const splitAnswerRows = (text: string): string[] =>
  text.split(ROW_SEPARATOR);

/** Rows back into the stored side text, which grading already reads as a list of answers. */
export const joinAnswerRows = (rows: readonly string[]): string =>
  rows.join(' / ');

const expandPart = (part: string, language: string): string[] => {
  const swaps = spacedSlashSwapVariants(part);
  if (swaps.length > 0) {
    const first = part.split(ROW_SEPARATOR)[0].trim();
    return swaps.some((swap) => swap.includes(first))
      ? swaps
      : [first, ...swaps];
  }
  return part.split(ROW_SEPARATOR).flatMap((piece) => {
    if (!COMPACT_SLASH.test(piece)) return [piece];
    const spelled = flashcardAnswerVariants(piece, language).filter(
      (variant) => !variant.includes('/')
    );
    return spelled.length > 0 ? spelled : [piece];
  });
};

/** Spells "el/la doctor/a; el/la médico/a" out as el doctor, la doctora, el médico, la médica. */
export const expandAnswerRows = (text: string, language: string): string[] => {
  const rows = text
    .split(/\s*;\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => expandPart(part, language))
    .map((row) => row.trim())
    .filter(Boolean);
  return rows.length > 0 ? [...new Set(rows)] : [text];
};

/** True when the text holds shorthand ("el/la doctor/a", "a; b", "a / b") that spells out into more rows. */
export const hasAnswerShorthand = (text: string, language: string): boolean =>
  expandAnswerRows(text, language).length > 1;
