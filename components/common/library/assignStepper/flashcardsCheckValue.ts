import type { FlashcardAssignForm } from '@/components/widgets/Flashcards/utils/flashcardAssign';
import {
  FLASHCARD_MODE_OPTIONS,
  FLASHCARD_SCORE_VISIBILITY_OPTIONS,
} from '@/components/widgets/Flashcards/utils/flashcardAssignOptions';

/** Check settings; the top switch owns `collectSubmission` (D9). */
export type FlashcardsCheckValue = Omit<
  FlashcardAssignForm,
  'collectSubmission'
>;

const optionLabel = <T>(
  options: Array<{ value: T; label: string }>,
  value: T
): string => options.find((option) => option.value === value)?.label ?? '';

export const formatFlashcardsCheckValue = (
  value: FlashcardsCheckValue
): string => {
  const score = optionLabel(
    FLASHCARD_SCORE_VISIBILITY_OPTIONS,
    value.scoreVisibility
  );
  return `${optionLabel(FLASHCARD_MODE_OPTIONS, value.checkMode)}, ${score.charAt(0).toLowerCase()}${score.slice(1)}`;
};
