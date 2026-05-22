/**
 * PlcQuizzesBody — Phase 2 quiz-section tab shell.
 *
 * Wraps the quiz library surface in a three-sub-tab pill bar that mirrors
 * `PlcAssignmentsBody` (Library / In-progress / Completed). The
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

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, History, Play, type LucideIcon } from 'lucide-react';
import { Plc } from '@/types';
import { PlcQuizLibraryBody } from './PlcQuizLibraryBody';
import { PlcAssignmentsInProgressSubTab } from '../tabs/PlcAssignmentsInProgressSubTab';
import { PlcAssignmentsCompletedSubTab } from '../tabs/PlcAssignmentsCompletedSubTab';

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
   * assignment editor. Mirrors `PlcAssignmentsBody`.
   */
  onCloseDashboard: () => void;
}

export const PlcQuizzesBody: React.FC<PlcQuizzesBodyProps> = ({
  plc,
  onCloseDashboard,
}) => {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('library');

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
      </div>
      <div className="flex-1 min-h-0">
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
    </div>
  );
};
