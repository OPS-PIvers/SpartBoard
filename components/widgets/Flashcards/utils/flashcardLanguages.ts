import { QUIZ_READ_ALOUD_LANGUAGES } from '@/config/quizReadAloud';

// Read-aloud languages first, then common classroom languages without a voice.
export const FLASHCARD_LANGUAGES: readonly { tag: string; label: string }[] = [
  ...QUIZ_READ_ALOUD_LANGUAGES,
  { tag: 'zh-CN', label: 'Chinese (Simplified)' },
  { tag: 'it-IT', label: 'Italian' },
  { tag: 'ja-JP', label: 'Japanese' },
  { tag: 'ko-KR', label: 'Korean' },
  { tag: 'la', label: 'Latin' },
  { tag: 'pt-BR', label: 'Portuguese (Brazil)' },
];

export const isFlashcardLanguagePreset = (tag: string): boolean =>
  FLASHCARD_LANGUAGES.some((language) => language.tag === tag);

export const describeLanguageTag = (tag: string): string | null => {
  const trimmed = tag.trim();
  if (!trimmed) return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(
      trimmed
    );
    return name && name !== trimmed ? name : null;
  } catch {
    return null;
  }
};
