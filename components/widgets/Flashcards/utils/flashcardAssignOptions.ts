import type { FlashcardMode, FlashcardSide, FlashcardTestType } from '@/types';

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

export const FLASHCARD_TEST_TYPE_OPTIONS: Array<{
  value: FlashcardTestType;
  label: string;
}> = [
  { value: 'mc', label: 'Multiple choice' },
  { value: 'fib', label: 'Fill in the blank' },
];
