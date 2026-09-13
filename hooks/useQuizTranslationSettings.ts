/** Admin-curated `admin_settings/quiz_translation` for the teacher surfaces (plan §5). */

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizTranslationSettings } from '@/types';
import {
  DEFAULT_QUIZ_TRANSLATION_SETTINGS,
  QUIZ_TRANSLATION_LANGUAGES,
  QUIZ_TRANSLATION_SETTINGS_DOC,
  normalizeQuizTranslationSettings,
} from '@/config/quizTranslation';

export interface UseQuizTranslationSettings {
  settings: QuizTranslationSettings;
  /** Curated languages the admin left enabled, in catalog order. */
  languages: typeof QUIZ_TRANSLATION_LANGUAGES;
}

/** `enabled` false keeps flagless hosts (and their tests) off the listener entirely. */
export function useQuizTranslationSettings(
  enabled: boolean = true
): UseQuizTranslationSettings {
  const [settings, setSettings] = useState<QuizTranslationSettings>(
    DEFAULT_QUIZ_TRANSLATION_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', QUIZ_TRANSLATION_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizeQuizTranslationSettings(snap.data())
            : DEFAULT_QUIZ_TRANSLATION_SETTINGS
        ),
      // An unreadable doc must not strand the teacher with zero languages.
      () => setSettings(DEFAULT_QUIZ_TRANSLATION_SETTINGS)
    );
  }, [enabled]);

  const languages = useMemo(
    () =>
      QUIZ_TRANSLATION_LANGUAGES.filter((l) =>
        settings.enabledLanguages.includes(l.code)
      ),
    [settings.enabledLanguages]
  );

  return { settings, languages };
}
