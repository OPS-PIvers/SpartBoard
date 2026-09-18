/** Live view of `admin_settings/paper_answer_sheets`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_PAPER_ANSWER_SHEETS_SETTINGS,
  PAPER_ANSWER_SHEETS_SETTINGS_DOC,
  normalizePaperAnswerSheetsSettings,
  type PaperAnswerSheetsSettings,
} from '@/config/paperAnswerSheets';

export function usePaperAnswerSheetsSettings(
  enabled: boolean = true
): PaperAnswerSheetsSettings {
  const [settings, setSettings] = useState<PaperAnswerSheetsSettings>(
    DEFAULT_PAPER_ANSWER_SHEETS_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', PAPER_ANSWER_SHEETS_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizePaperAnswerSheetsSettings(snap.data())
            : DEFAULT_PAPER_ANSWER_SHEETS_SETTINGS
        ),
      // An unreadable doc must hide the feature, never strand it half-on.
      () => setSettings(DEFAULT_PAPER_ANSWER_SHEETS_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
