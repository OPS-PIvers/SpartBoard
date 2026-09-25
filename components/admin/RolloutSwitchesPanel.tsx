// Admin card for the org-wide rollout switches kept in `admin_settings/*`.
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { FlaskConical, Loader2 } from 'lucide-react';
import { db } from '@/config/firebase';
import { Toggle } from '@/components/common/Toggle';
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

interface RolloutSwitch {
  docId: string;
  title: string;
  description: string;
  normalize: (raw: unknown) => { enabled: boolean };
}

/** One row per switch; a new `config/*Settings.ts` normalizer belongs here too. */
const ROLLOUT_SWITCHES: readonly RolloutSwitch[] = [
  {
    docId: PLC_NOTE_COLLAB_SETTINGS_DOC,
    title: 'PLC collaborative notes',
    description:
      'Teammates edit a shared PLC note at the same time and see each other’s changes live.',
    normalize: normalizePlcNoteCollabSettings,
  },
  {
    docId: PAPER_ANSWER_SHEETS_SETTINGS_DOC,
    title: 'Paper answer sheets',
    description:
      'Print bubble response sheets for a quiz and import the scanned stack. Adds “Print response sheets” and “Import responses” to the quiz menu and “Paper test” under the New Quiz caret, after Import.',
    normalize: normalizePaperAnswerSheetsSettings,
  },
  {
    docId: PLC_DELEGATED_PRINTING_SETTINGS_DOC,
    title: 'Print response sheets for a PLC teammate',
    description:
      'Adds “Print response sheets for a teammate” to the PLC quiz row menu, so a member can print a colleague’s stack when they are out. Needs paper answer sheets on as well. The colleague still scans, grades and publishes their own results.',
    normalize: normalizePlcDelegatedPrintingSettings,
  },
  {
    docId: ROSTER_GROUPS_INTEGRATION_SETTINGS_DOC,
    title: 'Class groups in widgets',
    description:
      'Lets teachers point a widget at a saved class group instead of the whole class, and split a class into groups from the roster editor. Group names stay in the teacher-only picker — never on a widget’s front face.',
    normalize: normalizeRosterGroupsIntegrationSettings,
  },
  {
    docId: PROJECTS_WIDGET_SETTINGS_DOC,
    title: 'Projects widget',
    description:
      'Adds the Projects widget to the dock: a teacher assigns one project to each group and every group tracks its own progress through the steps. Groups import from the Group Maker, so a class needs a ClassLink roster for the student side; other classes get a teacher-only tracker.',
    normalize: normalizeProjectsWidgetSettings,
  },
  {
    docId: QUIZ_DOCUMENT_IMPORT_SETTINGS_DOC,
    title: 'Build a quiz from a test document',
    description:
      'Lets teachers make a new quiz by uploading a PDF, Word file or Google Doc of a test, and fills a paper test\u2019s questions from the same document. Questions the reader can\u2019t find an answer for are marked \u201CNeeds answer\u201D and the quiz can\u2019t be assigned until a teacher fills them in.',
    normalize: normalizeQuizDocumentImportSettings,
  },
  {
    docId: SUB_LAUNCH_AS_TEACHER_SETTINGS_DOC,
    title: 'Substitutes can start an activity',
    description:
      'Lets a substitute your teachers named on a share start a quiz, video activity, guided activity or flashcard set from the boards they were left. The run belongs to the teacher, so the results wait in the teacher\u2019s account, tagged with who started it. Off means the substitute still sees the activity and its answers but cannot start it.',
    normalize: normalizeSubLaunchAsTeacherSettings,
  },
];

const RolloutRow: React.FC<{ sw: RolloutSwitch }> = ({ sw }) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'admin_settings', sw.docId);
    return onSnapshot(
      ref,
      (snap) => setEnabled(sw.normalize(snap.data()).enabled),
      (err) => {
        console.error('[RolloutSwitchesPanel]', sw.docId, err);
        setEnabled(false);
      }
    );
  }, [sw]);

  const handleChange = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'admin_settings', sw.docId), { enabled: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{sw.title}</p>
        <p className="mt-0.5 text-xs text-slate-600">{sw.description}</p>
        {error && (
          <p className="mt-1 text-xs font-medium text-brand-red-primary">
            {error}
          </p>
        )}
      </div>
      {enabled === null ? (
        <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-slate-400" />
      ) : (
        <Toggle
          checked={enabled}
          disabled={saving}
          onChange={(next) => void handleChange(next)}
          label={sw.title}
        />
      )}
    </li>
  );
};

export const RolloutSwitchesPanel: React.FC = () => (
  <div className="p-6 max-w-3xl">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
        <FlaskConical className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">Rollouts</h2>
        <p className="text-xs text-slate-600">
          Each switch applies to every teacher.
        </p>
      </div>
    </div>
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {ROLLOUT_SWITCHES.map((sw) => (
        <RolloutRow key={sw.docId} sw={sw} />
      ))}
    </ul>
  </div>
);
