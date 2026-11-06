import type { AccentSetId, AnswerKeyboard } from '@/types';

export const STUDENT_KEYBOARDS_FEATURE = 'student-keyboards' as const;

export interface AccentSet {
  id: AccentSetId;
  /** English name for the teacher's picker. */
  label: string;
  /** Lowercase keys; Shift upper-cases the letters. */
  keys: readonly string[];
}

export const ACCENT_SETS: readonly AccentSet[] = [
  {
    id: 'es',
    label: 'Spanish',
    keys: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'],
  },
  {
    id: 'fr',
    label: 'French',
    keys: [
      'à',
      'â',
      'æ',
      'ç',
      'é',
      'è',
      'ê',
      'ë',
      'î',
      'ï',
      'ô',
      'œ',
      'ù',
      'û',
      'ü',
      'ÿ',
      '«',
      '»',
    ],
  },
  { id: 'de', label: 'German', keys: ['ä', 'ö', 'ü', 'ß'] },
  {
    id: 'it',
    label: 'Italian',
    keys: ['à', 'è', 'é', 'ì', 'ò', 'ù'],
  },
  {
    id: 'pt',
    label: 'Portuguese',
    keys: ['á', 'â', 'ã', 'à', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú'],
  },
];

export function accentSet(id: string | undefined): AccentSet | undefined {
  return id ? ACCENT_SETS.find((s) => s.id === id) : undefined;
}

/** The accent set matching a BCP-47 language tag, e.g. 'es-MX' → Spanish. */
export function accentSetForLanguage(tag: string): AccentSetId | undefined {
  const primary = tag.trim().toLowerCase().split('-')[0] ?? '';
  return accentSet(primary)?.id;
}

/** Shift upper-cases letters; ß and punctuation stay as they are. */
export function shiftedKey(key: string): string {
  if (key === 'ß') return key;
  const upper = key.toLocaleUpperCase();
  return upper.length === key.length ? upper : key;
}

export function isAnswerKeyboard(value: unknown): value is AnswerKeyboard {
  return value === 'math' || (typeof value === 'string' && !!accentSet(value));
}

/** The accent set a question's keyboard uses, if any. */
export function answerAccents(
  keyboard: AnswerKeyboard | undefined
): AccentSetId | undefined {
  return keyboard && keyboard !== 'math' ? keyboard : undefined;
}
