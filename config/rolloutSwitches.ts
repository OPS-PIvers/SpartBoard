import type { GlobalFeature } from '@/types';
// Org-wide rollout switches kept in `admin_settings/*`, paired with their flag on the Previews tab.
import {
  PAPER_ANSWER_SHEETS_SETTINGS_DOC,
  normalizePaperAnswerSheetsSettings,
} from '@/config/paperAnswerSheets';
import {
  PLC_NOTE_COLLAB_SETTINGS_DOC,
  normalizePlcNoteCollabSettings,
} from '@/config/plcNoteCollab';
import {
  PLC_DELEGATED_PRINTING_SETTINGS_DOC,
  normalizePlcDelegatedPrintingSettings,
} from '@/config/plcDelegatedPrinting';
import {
  ROSTER_GROUPS_INTEGRATION_SETTINGS_DOC,
  normalizeRosterGroupsIntegrationSettings,
} from '@/config/rosterGroupsIntegration';
import {
  PROJECTS_WIDGET_SETTINGS_DOC,
  normalizeProjectsWidgetSettings,
} from '@/config/projectsWidget';
import {
  QUIZ_DOCUMENT_IMPORT_SETTINGS_DOC,
  normalizeQuizDocumentImportSettings,
} from '@/config/quizDocumentImport';
import {
  CLAUDE_REVIEW_REMINDERS_SETTINGS_DOC,
  normalizeClaudeReviewRemindersSettings,
} from '@/config/claudeReviewReminders';
import {
  GRADEBOOK_INDEX_SETTINGS_DOC,
  normalizeGradebookIndexSettings,
} from '@/config/gradebookIndex';
import {
  SUB_LAUNCH_AS_TEACHER_SETTINGS_DOC,
  normalizeSubLaunchAsTeacherSettings,
} from '@/config/subLaunchAsTeacher';
import { VIEW_AS_SETTINGS_DOC, normalizeViewAsSettings } from '@/config/viewAs';
import {
  ANALYTICS_HISTORY_SETTINGS_DOC,
  normalizeAnalyticsHistorySettings,
} from '@/config/analyticsHistory';
import {
  GROUP_REMINDER_EMAILS_SETTINGS_DOC,
  normalizeGroupReminderEmailsSettings,
} from '@/config/groupReminderEmails';

export interface RolloutSwitch {
  docId: string;
  title: string;
  description: string;
  /** The access flag this switch is ANDed with; both show on one Previews row. */
  feature?: GlobalFeature;
  normalize: (raw: unknown) => { enabled: boolean };
}

/** One row per switch; a new `config/*Settings.ts` normalizer belongs here too. */
export const ROLLOUT_SWITCHES: readonly RolloutSwitch[] = [
  {
    docId: PLC_NOTE_COLLAB_SETTINGS_DOC,
    title: 'PLC collaborative notes',
    description: 'Live co-editing of PLC notes.',
    normalize: normalizePlcNoteCollabSettings,
  },
  {
    docId: PAPER_ANSWER_SHEETS_SETTINGS_DOC,
    feature: 'paper-answer-sheets',
    title: 'Paper answer sheets',
    description: 'Print bubble sheets and import scans.',
    normalize: normalizePaperAnswerSheetsSettings,
  },
  {
    docId: PLC_DELEGATED_PRINTING_SETTINGS_DOC,
    title: 'Print response sheets for a PLC teammate',
    description: "Print a teammate's sheets. Needs paper answer sheets.",
    normalize: normalizePlcDelegatedPrintingSettings,
  },
  {
    docId: ROSTER_GROUPS_INTEGRATION_SETTINGS_DOC,
    feature: 'roster-groups',
    title: 'Class groups in widgets',
    description: 'Target a class group from a widget.',
    normalize: normalizeRosterGroupsIntegrationSettings,
  },
  {
    docId: PROJECTS_WIDGET_SETTINGS_DOC,
    title: 'Projects widget',
    description: 'Group project tracker. Student view needs ClassLink rosters.',
    normalize: normalizeProjectsWidgetSettings,
  },
  {
    docId: QUIZ_DOCUMENT_IMPORT_SETTINGS_DOC,
    feature: 'quiz-document-import',
    title: 'Build a quiz from a test document',
    description: 'Build a quiz from an uploaded test.',
    normalize: normalizeQuizDocumentImportSettings,
  },
  {
    docId: SUB_LAUNCH_AS_TEACHER_SETTINGS_DOC,
    title: 'Substitutes can start an activity',
    description: 'Subs can start activities. Results go to the teacher.',
    normalize: normalizeSubLaunchAsTeacherSettings,
  },
  {
    docId: CLAUDE_REVIEW_REMINDERS_SETTINGS_DOC,
    feature: 'claude-connector',
    title: 'Review reminders for Claude-made items',
    description:
      'Flag items Claude made or changed until the teacher opens them. On by default.',
    normalize: normalizeClaudeReviewRemindersSettings,
  },
  {
    docId: ANALYTICS_HISTORY_SETTINGS_DOC,
    title: 'Analytics history estimate',
    description: 'Fill Active Users history before launch from past records.',
    normalize: normalizeAnalyticsHistorySettings,
  },
  {
    docId: GRADEBOOK_INDEX_SETTINGS_DOC,
    feature: 'gradebook',
    title: 'Gradebook score index',
    description: 'Collect every score for the gradebook.',
    normalize: normalizeGradebookIndexSettings,
  },
  {
    docId: VIEW_AS_SETTINGS_DOC,
    title: 'Super admin View as',
    description: "Super admins open a user's account to troubleshoot.",
    normalize: normalizeViewAsSettings,
  },
  {
    docId: GROUP_REMINDER_EMAILS_SETTINGS_DOC,
    feature: 'group-reminders',
    title: 'Group reminder emails',
    description: 'Emails teachers at their pull-out group alert times.',
    normalize: normalizeGroupReminderEmailsSettings,
  },
];
