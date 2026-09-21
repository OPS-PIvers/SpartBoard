/** Live view of `admin_settings/quiz_document_import`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_QUIZ_DOCUMENT_IMPORT_SETTINGS,
  QUIZ_DOCUMENT_IMPORT_SETTINGS_DOC,
  normalizeQuizDocumentImportSettings,
  type QuizDocumentImportSettings,
} from '@/config/quizDocumentImport';

export function useQuizDocumentImportSettings(
  enabled: boolean = true
): QuizDocumentImportSettings {
  const [settings, setSettings] = useState<QuizDocumentImportSettings>(
    DEFAULT_QUIZ_DOCUMENT_IMPORT_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', QUIZ_DOCUMENT_IMPORT_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizeQuizDocumentImportSettings(snap.data())
            : DEFAULT_QUIZ_DOCUMENT_IMPORT_SETTINGS
        ),
      // An unreadable doc must hide the feature, never strand it half-on.
      () => setSettings(DEFAULT_QUIZ_DOCUMENT_IMPORT_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
