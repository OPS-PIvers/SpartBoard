/** Live view of `admin_settings/quiz_recording_notice`; the notice stays on until the doc says otherwise. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_QUIZ_RECORDING_NOTICE_SETTINGS,
  QUIZ_RECORDING_NOTICE_SETTINGS_DOC,
  normalizeQuizRecordingNoticeSettings,
  type QuizRecordingNoticeSettings,
} from '@/config/quizRecordingNotice';

export function useQuizRecordingNoticeSettings(enabled: boolean): {
  settings: QuizRecordingNoticeSettings;
  loaded: boolean;
} {
  const [state, setState] = useState<{
    settings: QuizRecordingNoticeSettings;
    loaded: boolean;
  }>({ settings: DEFAULT_QUIZ_RECORDING_NOTICE_SETTINGS, loaded: false });

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', QUIZ_RECORDING_NOTICE_SETTINGS_DOC),
      (snap) =>
        setState({
          settings: snap.exists()
            ? normalizeQuizRecordingNoticeSettings(snap.data())
            : DEFAULT_QUIZ_RECORDING_NOTICE_SETTINGS,
          loaded: true,
        }),
      // An unreadable doc keeps the notice on.
      () =>
        setState({
          settings: DEFAULT_QUIZ_RECORDING_NOTICE_SETTINGS,
          loaded: true,
        })
    );
  }, [enabled]);

  return state;
}
