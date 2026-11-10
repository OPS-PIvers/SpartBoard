import type { FlashcardStudySettings, FlashcardTestType } from '@/types';

/** Matches the student player's defaults, unlocked. */
export const DEFAULT_FLASHCARDS_STUDY_VALUE: FlashcardStudySettings = {
  showFirst: 'term',
  shuffle: false,
  strict: false,
  testTypes: ['mc', 'fib'],
  locked: false,
};

const TEST_TYPES: readonly FlashcardTestType[] = ['mc', 'fib'];

/** A saved or stamped value, or null when it isn't one. */
export const parseFlashcardsStudyValue = (
  raw: unknown
): FlashcardStudySettings | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const testTypes = Array.isArray(r.testTypes)
    ? TEST_TYPES.filter((type) => (r.testTypes as unknown[]).includes(type))
    : [];
  return {
    showFirst: r.showFirst === 'definition' ? 'definition' : 'term',
    shuffle: r.shuffle === true,
    strict: r.strict === true,
    testTypes:
      testTypes.length > 0
        ? testTypes
        : DEFAULT_FLASHCARDS_STUDY_VALUE.testTypes,
    locked: r.locked === true,
  };
};

/** Closed-step summary: which side shows first, and whether it is locked. */
export const formatFlashcardsStudyValue = (
  value: FlashcardStudySettings
): string => {
  const side =
    value.showFirst === 'definition' ? 'Definition first' : 'Term first';
  return value.locked ? `${side}, locked` : side;
};
