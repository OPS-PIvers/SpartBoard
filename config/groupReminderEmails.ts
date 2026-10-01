/** Kill switch `admin_settings/group_reminder_emails` for emailed pull-out group alerts. */

export const GROUP_REMINDER_EMAILS_SETTINGS_DOC = 'group_reminder_emails';

export interface GroupReminderEmailsSettings {
  /** The scheduled sender re-checks this, so turning it off stops every email. */
  enabled: boolean;
}

export const DEFAULT_GROUP_REMINDER_EMAILS_SETTINGS: GroupReminderEmailsSettings =
  { enabled: false };

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeGroupReminderEmailsSettings(
  raw: unknown
): GroupReminderEmailsSettings {
  if (!raw || typeof raw !== 'object')
    return DEFAULT_GROUP_REMINDER_EMAILS_SETTINGS;
  return { enabled: (raw as { enabled?: unknown }).enabled === true };
}
