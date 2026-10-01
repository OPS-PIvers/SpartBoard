/** Live view of `admin_settings/group_reminder_emails`; the default (off) stands in until the doc exists. */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_GROUP_REMINDER_EMAILS_SETTINGS,
  GROUP_REMINDER_EMAILS_SETTINGS_DOC,
  normalizeGroupReminderEmailsSettings,
  type GroupReminderEmailsSettings,
} from '@/config/groupReminderEmails';

export function useGroupReminderEmailsSettings(
  enabled: boolean = true
): GroupReminderEmailsSettings {
  const [settings, setSettings] = useState<GroupReminderEmailsSettings>(
    DEFAULT_GROUP_REMINDER_EMAILS_SETTINGS
  );

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', GROUP_REMINDER_EMAILS_SETTINGS_DOC),
      (snap) =>
        setSettings(
          snap.exists()
            ? normalizeGroupReminderEmailsSettings(snap.data())
            : DEFAULT_GROUP_REMINDER_EMAILS_SETTINGS
        ),
      // Hiding the toggle is the safe failure; the sender checks the switch too.
      () => setSettings(DEFAULT_GROUP_REMINDER_EMAILS_SETTINGS)
    );
  }, [enabled]);

  return settings;
}
