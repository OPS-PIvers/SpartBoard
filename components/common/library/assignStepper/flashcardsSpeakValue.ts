import type { TFunction } from 'i18next';

/** Speak step for a Flashcards study assignment (plan §4.3): shown, and whether its settings are locked. */
export interface FlashcardsSpeakValue {
  show: boolean;
  lock: boolean;
}

export const DEFAULT_FLASHCARDS_SPEAK_VALUE: FlashcardsSpeakValue = {
  show: true,
  lock: false,
};

export const formatFlashcardsSpeakValue = (
  value: FlashcardsSpeakValue,
  t: TFunction
): string =>
  !value.show
    ? t('flashcards.speak.assign.valueOff', 'Off')
    : value.lock
      ? t('flashcards.speak.assign.valueLocked', 'On, locked')
      : t('flashcards.speak.assign.valueOn', 'On');
