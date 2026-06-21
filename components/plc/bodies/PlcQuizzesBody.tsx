/**
 * PlcQuizzesBody — Phase 2 quiz-section tab shell.
 *
 * Wraps the quiz library surface in a three-sub-tab pill bar
 * (Library / In-progress / Completed). The
 * In-progress and Completed sub-tabs reuse the shared
 * `PlcAssignmentsInProgress/CompletedSubTab` components, scoped to
 * `kind === 'quiz'` so video-activity rows never leak into the Quizzes
 * section.
 *
 * Sub-tabs:
 *
 *   - Library     — the existing `PlcQuizLibraryBody` (PLC quiz templates
 *                   awaiting pickup + assign flow). Unchanged internals.
 *   - In-progress — `plcs/{plcId}/assignment_index` filtered to
 *                   `status in ['active','paused']` AND `kind === 'quiz'`.
 *   - Completed   — same index filtered to `status === 'inactive'` AND
 *                   `kind === 'quiz'`. Read-only history.
 */

import React, { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, History, Play, Plus, type LucideIcon } from 'lucide-react';
import { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { useQuiz } from '@/hooks/useQuiz';
import { PlcQuizLibraryBody } from './PlcQuizLibraryBody';
import { PlcAssignmentsInProgressSubTab } from '@/components/plc/tabs/PlcAssignmentsInProgressSubTab';
import { PlcAssignmentsCompletedSubTab } from '@/components/plc/tabs/PlcAssignmentsCompletedSubTab';
import { PlcNewQuizAssignmentModal } from '../PlcNewQuizAssignmentModal';

type SubTabId = 'library' | 'inProgress' | 'completed';

interface SubTabDef {
  id: SubTabId;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
}

const SUB_TABS: readonly SubTabDef[] = [
  {
    id: 'library',
    icon: BookOpen,
    labelKey: 'plcDashboard.quizzesSubTabs.library',
    labelDefault: 'Library',
  },
  {
    id: 'inProgress',
    icon: Play,
    labelKey: 'plcDashboard.quizzesSubTabs.inProgress',
    labelDefault: 'In-progress',
  },
  {
    id: 'completed',
    icon: History,
    labelKey: 'plcDashboard.quizzesSubTabs.completed',
    labelDefault: 'Completed',
  },
] as const;

interface PlcQuizzesBodyProps {
  plc: Plc;
  /**
   * Closes the entire PLC dashboard. Forwarded to the Library sub-tab so
   * its "Edit all settings…" hand-off from the post-assign class-period
   * picker can dismiss the dashboard before the QuizWidget opens the full
   * assignment editor.
   */
  onCloseDashboard: () => void;
}

export const PlcQuizzesBody: React.FC<PlcQuizzesBodyProps> = ({
  plc,
  onCloseDashboard,
}) => {
  const { t } = useTranslation();
  const { user, getAssignmentMode } = useAuth();
  // Viewers can browse the library + assignment history but can't assign new
  // quizzes (Decision 3.2). Rules hard-deny viewer assignment writes.
  const canEdit = useCanEditPlcContent();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('library');
  // Wizard modal state for the top-level "+ Assign Quiz" CTA. Ported from
  // the former standalone Assignments page, which was collapsed into this
  // section.
  const [newQuizOpen, setNewQuizOpen] = useState(false);
  // Stable id so the screen-reader-only disabled-reason text can be
  // associated with the CTA via `aria-describedby`. Native `disabled`
  // strips a button from the tab order, so we use `aria-disabled` + a
  // click guard instead so the control stays focusable and announces why.
  const quizCtaReasonId = useId();
  // Stable ids so each tabpanel can point back at its tab via aria-labelledby
  // and each tab can point at its panel via aria-controls (WCAG AA tablist).
  const tabIdBase = useId();
  const tabButtonId = (id: SubTabId) => `${tabIdBase}-tab-${id}`;
  const tabPanelId = (id: SubTabId) => `${tabIdBase}-panel-${id}`;

  // Library counts + Drive-connect status feed the CTA disabled state.
  // Gated on `activeSubTab === 'library'` so the personal-library Firestore
  // listener (and Drive-token snapshot) only mounts when the CTA is
  // actually visible — In-progress / Completed don't render the CTA, so
  // paying for the listener there is wasted reads. `useQuiz` early-returns
  // when `userId` is undefined, so passing `undefined` is the "off" switch.
  const ctaActive = activeSubTab === 'library';
  const { quizzes, isDriveConnected: quizDriveConnected } = useQuiz(
    ctaActive ? user?.uid : undefined
  );

  const openQuizWizard = useCallback(() => {
    setNewQuizOpen(true);
  }, []);

  // Snapshot the quiz widget's org-wide assignment mode for the wizard.
  const quizAssignmentMode = getAssignmentMode('quiz');

  // CTA disabled-reason resolution. Drive-disconnect outranks empty library
  // because reconnecting Drive is a single immediate action; the empty
  // library requires authoring content first.
  const quizCtaDisabledReason: string | undefined = !quizDriveConnected
    ? t('plcDashboard.newAssignment.quiz.ctaDisabledDrive', {
        defaultValue: 'Connect Google Drive to assign a quiz.',
      })
    : quizzes.length === 0
      ? t('plcDashboard.newAssignment.quiz.ctaDisabledEmpty', {
          defaultValue:
            'You have no quizzes in your personal library yet. Create one in the Quiz widget first.',
        })
      : undefined;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          role="tablist"
          aria-label={t('plcDashboard.quizzesSubTabs.label', {
            defaultValue: 'Quiz views',
          })}
          className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl self-start"
        >
          {SUB_TABS.map((tab) => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                id={tabButtonId(tab.id)}
                aria-selected={isActive}
                aria-controls={tabPanelId(tab.id)}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'bg-white text-brand-blue-dark shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
                {t(tab.labelKey, { defaultValue: tab.labelDefault })}
              </button>
            );
          })}
        </div>
        {activeSubTab === 'library' && canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                quizCtaDisabledReason !== undefined ? undefined : openQuizWizard
              }
              aria-disabled={quizCtaDisabledReason !== undefined}
              aria-describedby={
                quizCtaDisabledReason !== undefined
                  ? quizCtaReasonId
                  : undefined
              }
              title={
                quizCtaDisabledReason ??
                t('plcDashboard.newAssignment.quiz.ctaTooltip', {
                  defaultValue:
                    'Create a PLC quiz assignment from your personal library.',
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-brand-blue-primary"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('plcDashboard.newAssignment.quiz.ctaLabel', {
                defaultValue: 'Assign Quiz',
              })}
            </button>
            {quizCtaDisabledReason !== undefined && (
              <span id={quizCtaReasonId} className="sr-only">
                {quizCtaDisabledReason}
              </span>
            )}
          </div>
        )}
      </div>
      <div
        role="tabpanel"
        id={tabPanelId(activeSubTab)}
        aria-labelledby={tabButtonId(activeSubTab)}
        className="flex-1 min-h-0"
      >
        {activeSubTab === 'library' && (
          <PlcQuizLibraryBody plc={plc} onCloseDashboard={onCloseDashboard} />
        )}
        {activeSubTab === 'inProgress' && (
          <PlcAssignmentsInProgressSubTab plc={plc} kindFilter="quiz" />
        )}
        {activeSubTab === 'completed' && (
          <PlcAssignmentsCompletedSubTab plc={plc} kindFilter="quiz" />
        )}
      </div>
      {newQuizOpen && (
        <PlcNewQuizAssignmentModal
          plc={plc}
          assignmentMode={quizAssignmentMode}
          onClose={() => setNewQuizOpen(false)}
        />
      )}
    </div>
  );
};
