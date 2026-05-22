/**
 * PlcVideoActivitiesTabsBody — Phase 3a video-activity section tab shell.
 *
 * Wraps the video-activity library surface in a three-sub-tab pill bar that
 * mirrors `PlcQuizzesBody` (Library / In-progress / Completed). The
 * In-progress and Completed sub-tabs reuse the shared
 * `PlcAssignmentsInProgress/CompletedSubTab` components, scoped to
 * `kind === 'video-activity'` so quiz rows never leak into the Video
 * Activities section.
 *
 * Sub-tabs:
 *
 *   - Library     — the existing `PlcVideoActivitiesBody` (PLC video-activity
 *                   templates awaiting pickup + share flow). Unchanged
 *                   internals.
 *   - In-progress — `plcs/{plcId}/assignment_index` filtered to
 *                   `status in ['active','paused']` AND
 *                   `kind === 'video-activity'`.
 *   - Completed   — same index filtered to `status === 'inactive'` AND
 *                   `kind === 'video-activity'`. Read-only history.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, History, Play, type LucideIcon } from 'lucide-react';
import { Plc } from '@/types';
import { PlcVideoActivitiesBody } from './PlcVideoActivitiesBody';
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
    labelKey: 'plcDashboard.videoActivitiesSubTabs.library',
    labelDefault: 'Library',
  },
  {
    id: 'inProgress',
    icon: Play,
    labelKey: 'plcDashboard.videoActivitiesSubTabs.inProgress',
    labelDefault: 'In-progress',
  },
  {
    id: 'completed',
    icon: History,
    labelKey: 'plcDashboard.videoActivitiesSubTabs.completed',
    labelDefault: 'Completed',
  },
] as const;

interface PlcVideoActivitiesTabsBodyProps {
  plc: Plc;
}

export const PlcVideoActivitiesTabsBody: React.FC<
  PlcVideoActivitiesTabsBodyProps
> = ({ plc }) => {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('library');

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          role="tablist"
          aria-label={t('plcDashboard.videoActivitiesSubTabs.label', {
            defaultValue: 'Video activity views',
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
        {activeSubTab === 'library' && <PlcVideoActivitiesBody plc={plc} />}
        {activeSubTab === 'inProgress' && (
          <PlcAssignmentsInProgressSubTab
            plc={plc}
            kindFilter="video-activity"
          />
        )}
        {activeSubTab === 'completed' && (
          <PlcAssignmentsCompletedSubTab
            plc={plc}
            kindFilter="video-activity"
          />
        )}
      </div>
    </div>
  );
};
