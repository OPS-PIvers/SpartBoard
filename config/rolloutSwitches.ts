// Org-wide rollout switches kept in `admin_settings/*`, shown on the Rollouts tab.
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
  SUB_LAUNCH_AS_TEACHER_SETTINGS_DOC,
  normalizeSubLaunchAsTeacherSettings,
} from '@/config/subLaunchAsTeacher';

export interface RolloutSwitch {
  docId: string;
  title: string;
  description: string;
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
];
