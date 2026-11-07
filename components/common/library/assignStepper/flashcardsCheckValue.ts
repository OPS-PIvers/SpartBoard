import type { FlashcardAssignForm } from '@/components/widgets/Flashcards/utils/flashcardAssign';
import { FLASHCARD_MODE_OPTIONS } from '@/components/widgets/Flashcards/utils/flashcardAssignOptions';

/** Check settings; the top switch owns `collectSubmission` (D9). */
export type FlashcardsCheckValue = Omit<
  FlashcardAssignForm,
  'collectSubmission'
>;

/** Summary for How students are checked: the mode alone (Speak included). */
export const formatFlashcardsModeValue = (
  value: FlashcardsCheckValue
): string =>
  value.checkMode === 'speak'
    ? 'Speak'
    : (FLASHCARD_MODE_OPTIONS.find((option) => option.value === value.checkMode)
        ?.label ?? '');
