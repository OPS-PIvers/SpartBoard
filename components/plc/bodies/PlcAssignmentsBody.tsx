/**
 * PlcAssignmentsBody — Phase 2B body extraction.
 *
 * Owns the three-sub-tab assignments surface (Library / In-progress /
 * Completed). Mirrors the `NotesBody` / `PlcQuizLibraryBody` pattern so
 * the v2 grid renderer (and the fullscreen expansion path in
 * `PlcDashboard.renderExpandedBody`) can mount this surface directly
 * without going through tab chrome. The sub-tab routing and pill bar
 * still live here — only the legacy v1 tab shell moves up to the
 * thin-wrapper `PlcAssignmentsTab`.
 *
 * Sub-tabs:
 *
 *   - Library       — `plcs/{plcId}/assignments/` templates awaiting
 *                     pickup. "Add to my board" picker + unshare.
 *   - In-progress   — `plcs/{plcId}/assignment_index` filtered to
 *                     `status in ['active','paused']`. Live across the
 *                     team.
 *   - Completed     — same index filtered to `status === 'inactive'`.
 *                     Read-only history.
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  History,
  Play,
  PlayCircle,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { PlcAssignmentsLibrarySubTab } from '../tabs/PlcAssignmentsLibrarySubTab';
import { PlcAssignmentsInProgressSubTab } from '../tabs/PlcAssignmentsInProgressSubTab';
import { PlcAssignmentsCompletedSubTab } from '../tabs/PlcAssignmentsCompletedSubTab';
import { PlcNewQuizAssignmentModal } from '../PlcNewQuizAssignmentModal';
import { PlcNewVideoActivityAssignmentModal } from '../PlcNewVideoActivityAssignmentModal';

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
    icon: ClipboardList,
    labelKey: 'plcDashboard.assignmentsSubTabs.library',
    labelDefault: 'Library',
  },
  {
    id: 'inProgress',
    icon: Play,
    labelKey: 'plcDashboard.assignmentsSubTabs.inProgress',
    labelDefault: 'In-progress',
  },
  {
    id: 'completed',
    icon: History,
    labelKey: 'plcDashboard.assignmentsSubTabs.completed',
    labelDefault: 'Completed',
  },
] as const;

interface PlcAssignmentsBodyProps {
  plc: Plc;
  /**
   * Closes the entire PLC dashboard. Forwarded to the Library sub-tab so
   * its "Edit all settings…" hand-off from the post-import class-period
   * picker can dismiss the dashboard before the QuizWidget opens the
   * full assignment editor.
   */
  onCloseDashboard: () => void;
}

export const PlcAssignmentsBody: React.FC<PlcAssignmentsBodyProps> = ({
  plc,
  onCloseDashboard,
}) => {
  const { t } = useTranslation();
  const { getAssignmentMode } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('library');
  // Wizard modal state. Two distinct entry points (per the design call
  // landed in this PR's brief): the teacher picks "+ Assign Quiz" or
  // "+ Assign Video" up-front rather than choosing the content type
  // mid-wizard. Modals are mutually exclusive — opening one closes the
  // other so we don't fight Modal's focus-trap.
  const [newQuizOpen, setNewQuizOpen] = useState(false);
  const [newVideoOpen, setNewVideoOpen] = useState(false);

  const openQuizWizard = useCallback(() => {
    setNewVideoOpen(false);
    setNewQuizOpen(true);
  }, []);
  const openVideoWizard = useCallback(() => {
    setNewQuizOpen(false);
    setNewVideoOpen(true);
  }, []);

  // Read each widget's org-wide assignment mode separately. Quiz and VA
  // are gated by independent feature permissions — a school can run quiz
  // assignments in `'submissions'` mode while video activities are in
  // `'view-only'`. Snapshotting once at body render is fine since both
  // values feed into wizards that the teacher actively opens.
  const quizAssignmentMode = getAssignmentMode('quiz');
  const videoAssignmentMode = getAssignmentMode('videoActivity');

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Top row: sub-tab pill bar + library-only CTAs. The CTAs only
          render when the Library sub-tab is active so they don't shout
          at the teacher in the In-progress / Completed views (where
          authoring a new template would be off-task). */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          role="tablist"
          aria-label={t('plcDashboard.assignmentsSubTabs.label', {
            defaultValue: 'Assignment views',
          })}
          className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl self-start"
        >
          {SUB_TABS.map((tab) => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
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
        {activeSubTab === 'library' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openQuizWizard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors"
              title={t('plcDashboard.newAssignment.quiz.ctaTooltip', {
                defaultValue:
                  'Create a PLC quiz assignment from your personal library.',
              })}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('plcDashboard.newAssignment.quiz.ctaLabel', {
                defaultValue: 'Assign Quiz',
              })}
            </button>
            <button
              type="button"
              onClick={openVideoWizard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors"
              title={t('plcDashboard.newAssignment.video.ctaTooltip', {
                defaultValue:
                  'Create a PLC video activity assignment from your personal library.',
              })}
            >
              <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {t('plcDashboard.newAssignment.video.ctaLabel', {
                defaultValue: 'Assign Video',
              })}
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {activeSubTab === 'library' && (
          <PlcAssignmentsLibrarySubTab
            plc={plc}
            onCloseDashboard={onCloseDashboard}
            onNewQuizAssignment={openQuizWizard}
            onNewVideoActivityAssignment={openVideoWizard}
          />
        )}
        {activeSubTab === 'inProgress' && (
          <PlcAssignmentsInProgressSubTab plc={plc} />
        )}
        {activeSubTab === 'completed' && (
          <PlcAssignmentsCompletedSubTab plc={plc} />
        )}
      </div>
      {newQuizOpen && (
        <PlcNewQuizAssignmentModal
          plc={plc}
          assignmentMode={quizAssignmentMode}
          onClose={() => setNewQuizOpen(false)}
        />
      )}
      {newVideoOpen && (
        <PlcNewVideoActivityAssignmentModal
          plc={plc}
          assignmentMode={videoAssignmentMode}
          onClose={() => setNewVideoOpen(false)}
        />
      )}
    </div>
  );
};
