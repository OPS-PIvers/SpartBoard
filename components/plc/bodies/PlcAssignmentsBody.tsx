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
import { useQuiz } from '@/hooks/useQuiz';
import { useVideoActivity } from '@/hooks/useVideoActivity';
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
  const { user, getAssignmentMode } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('library');
  // Wizard modal state. Two distinct entry points (per the design call
  // landed in this PR's brief): the teacher picks "+ Assign Quiz" or
  // "+ Assign Video" up-front rather than choosing the content type
  // mid-wizard. Modals are mutually exclusive — opening one closes the
  // other so we don't fight Modal's focus-trap.
  const [newQuizOpen, setNewQuizOpen] = useState(false);
  const [newVideoOpen, setNewVideoOpen] = useState(false);

  // Library counts + Drive-connect status feed the CTA disabled state.
  // Matches the `shareCta` pattern from `PlcQuizLibraryBody` (PR #1595):
  // a teacher with an empty personal library or no Drive connection sees
  // the button disabled with a tooltip explaining why, rather than
  // clicking through to an empty picker.
  //
  // Gated on `activeSubTab === 'library'` so the personal-library
  // Firestore listeners (and Drive-token snapshots) only mount when the
  // teacher is actually looking at the Library sub-tab — In-progress
  // and Completed don't render the CTAs, so paying for the listeners
  // there is wasted reads. The hooks early-return when `userId` is
  // undefined (`useQuiz.ts` / `useVideoActivity.ts` both check this),
  // so passing `undefined` is the documented "off" switch.
  const ctasActive = activeSubTab === 'library';
  const { quizzes, isDriveConnected: quizDriveConnected } = useQuiz(
    ctasActive ? user?.uid : undefined
  );
  const { activities, isDriveConnected: videoDriveConnected } =
    useVideoActivity(ctasActive ? user?.uid : undefined);

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

  // CTA disabled-reason resolution. Drive-disconnect outranks empty
  // library because reconnecting Drive is a single action the teacher
  // can take immediately; the empty-library state requires authoring
  // content first. Returning a tooltip string (or undefined when the
  // CTA is enabled) keeps the render-time JSX simple.
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
  const videoCtaDisabledReason: string | undefined = !videoDriveConnected
    ? t('plcDashboard.newAssignment.video.ctaDisabledDrive', {
        defaultValue: 'Connect Google Drive to assign a video activity.',
      })
    : activities.length === 0
      ? t('plcDashboard.newAssignment.video.ctaDisabledEmpty', {
          defaultValue:
            'You have no video activities in your personal library yet. Create one in the Video Activity widget first.',
        })
      : undefined;

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
              disabled={quizCtaDisabledReason !== undefined}
              title={
                quizCtaDisabledReason ??
                t('plcDashboard.newAssignment.quiz.ctaTooltip', {
                  defaultValue:
                    'Create a PLC quiz assignment from your personal library.',
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('plcDashboard.newAssignment.quiz.ctaLabel', {
                defaultValue: 'Assign Quiz',
              })}
            </button>
            <button
              type="button"
              onClick={openVideoWizard}
              disabled={videoCtaDisabledReason !== undefined}
              title={
                videoCtaDisabledReason ??
                t('plcDashboard.newAssignment.video.ctaTooltip', {
                  defaultValue:
                    'Create a PLC video activity assignment from your personal library.',
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            newQuizDisabledReason={quizCtaDisabledReason}
            newVideoActivityDisabledReason={videoCtaDisabledReason}
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
          onCreated={() => {
            // VA assignments don't have a Library template writer today
            // — only Quiz does (see `useQuizAssignments.createAssignment`'s
            // `writePlcAssignmentTemplate` call). Without this nudge the
            // teacher would land back on the Library sub-tab and see
            // "No assignment templates yet" with no visible change, even
            // though `assignment_index` now carries the new row. Jump
            // to In-progress so they see the freshly-created entry.
            setActiveSubTab('inProgress');
          }}
        />
      )}
    </div>
  );
};
