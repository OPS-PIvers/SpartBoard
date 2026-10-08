import type {
  FlashcardMasteryThreshold,
  FlashcardMode,
  FlashcardScoreVisibility,
  FlashcardSide,
  FlashcardTestType,
} from '@/types';

export const FLASHCARD_MODE_OPTIONS: Array<{
  value: FlashcardMode;
  label: string;
}> = [
  { value: 'flashcards', label: 'Flashcards' },
  { value: 'write', label: 'Write' },
  { value: 'test', label: 'Test' },
];

export const FLASHCARD_SIDE_OPTIONS: Array<{
  value: FlashcardSide;
  label: string;
}> = [
  { value: 'term', label: 'Term' },
  { value: 'definition', label: 'Definition' },
];

export const FLASHCARD_THRESHOLD_OPTIONS: Array<{
  value: FlashcardMasteryThreshold;
  label: string;
}> = [
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

export const FLASHCARD_SCORE_VISIBILITY_OPTIONS: Array<{
  value: FlashcardScoreVisibility;
  label: string;
}> = [
  { value: 'none', label: 'Hide until I publish' },
  { value: 'score', label: 'Score only' },
  { value: 'score-and-answers', label: 'Score and correct answers' },
];

export const FLASHCARD_TEST_TYPE_OPTIONS: Array<{
  value: FlashcardTestType;
  label: string;
}> = [
  { value: 'mc', label: 'Multiple choice' },
  { value: 'fib', label: 'Fill in the blank' },
];
