/**
 * PlcAssignmentsTab — Phase 3 container.
 *
 * Houses three sub-tabs:
 *
 *   - Library       — `plcs/{plcId}/assignments/` templates awaiting
 *                     pickup. "Add to my board" picker + unshare.
 *   - In-progress   — `plcs/{plcId}/assignment_index` filtered to
 *                     `status in ['active','paused']`. Live across the
 *                     team.
 *   - Completed     — same index filtered to `status === 'inactive'`.
 *                     Read-only history (folds in the pre-Phase-3
 *                     top-level "Completed Assignments" tab; that tab
 *                     was removed from `PlcDashboard.tsx`).
 *
 * Sub-tab pills mirror the desktop tab-pill style of `PlcDashboard.tsx`
 * but are scoped to the assignments tab's surface. Default sub-tab is
 * Library.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, History, Play, type LucideIcon } from 'lucide-react';
import { Plc } from '@/types';
import { PlcAssignmentsLibrarySubTab } from './PlcAssignmentsLibrarySubTab';
import { PlcAssignmentsInProgressSubTab } from './PlcAssignmentsInProgressSubTab';
import { PlcAssignmentsCompletedSubTab } from './PlcAssignmentsCompletedSubTab';

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

interface PlcAssignmentsTabProps {
  plc: Plc;
  /**
   * Closes the entire PLC dashboard. Forwarded to the Library sub-tab so
   * its "Edit all settings…" hand-off from the post-import class-period
   * picker can dismiss the dashboard before the QuizWidget opens the
   * full assignment editor.
   */
  onCloseDashboard: () => void;
}

export const PlcAssignmentsTab: React.FC<PlcAssignmentsTabProps> = ({
  plc,
  onCloseDashboard,
}) => {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('library');

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Sub-tab pill bar. Sticky so it stays visible while the sub-tab
          content scrolls — mirrors the desktop pill style of the parent
          dashboard header but in a lighter, secondary palette. */}
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
              <tab.icon className="w-3.5 h-3.5" />
              {t(tab.labelKey, { defaultValue: tab.labelDefault })}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        {activeSubTab === 'library' && (
          <PlcAssignmentsLibrarySubTab
            plc={plc}
            onCloseDashboard={onCloseDashboard}
          />
        )}
        {activeSubTab === 'inProgress' && (
          <PlcAssignmentsInProgressSubTab plc={plc} />
        )}
        {activeSubTab === 'completed' && (
          <PlcAssignmentsCompletedSubTab plc={plc} />
        )}
      </div>
    </div>
  );
};
