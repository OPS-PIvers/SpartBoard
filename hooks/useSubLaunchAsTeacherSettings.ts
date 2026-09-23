/** Live view of `admin_settings/sub_launch_as_teacher`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS,
  SUB_LAUNCH_AS_TEACHER_SETTINGS_DOC,
  normalizeSubLaunchAsTeacherSettings,
  type SubLaunchAsTeacherSettings,
} from '@/config/subLaunchAsTeacher';

export function useSubLaunchAsTeacherSettings(
  enabled: boolean = true
): SubLaunchAsTeacherSettings {
  const [settings, setSettings] = useState<SubLaunchAsTeacherSettings>(
    DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', SUB_LAUNCH_AS_TEACHER_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizeSubLaunchAsTeacherSettings(snap.data())
            : DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS
        ),
      // Hiding Launch is the safe failure: the callable checks the same switch
      // itself, so an unreadable doc costs a button, not correctness.
      () => setSettings(DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
