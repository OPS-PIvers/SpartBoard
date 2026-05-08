import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader2 } from 'lucide-react';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { Plc } from '@/types';
import { PlcAssignmentIndexRow } from './PlcAssignmentIndexRow';

interface PlcAssignmentsInProgressSubTabProps {
  plc: Plc;
}

/**
 * In-progress sub-tab — assignments at least one PLC member is currently
 * running (status `'active'` or `'paused'`). Status is mirrored
 * fire-and-forget by the source assignment's owner; entries pre-Phase-3
 * lack the field and default to `'active'`, so they surface here until
 * their owner deactivates them.
 */
export const PlcAssignmentsInProgressSubTab: React.FC<
  PlcAssignmentsInProgressSubTabProps
> = ({ plc }) => {
  const { t } = useTranslation();
  const { entries, loading } = usePlcAssignmentIndex(plc.id);

  const visible = useMemo(
    () => entries.filter((e) => e.status === 'active' || e.status === 'paused'),
    [entries]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
          <ClipboardList className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">
          {t('plcDashboard.assignmentsInProgress.emptyTitle', {
            defaultValue: 'No assignments in progress',
          })}
        </h3>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          {t('plcDashboard.assignmentsInProgress.emptySubtitle', {
            defaultValue:
              'When you or a teammate starts a PLC-mode assignment, it shows up here. Pause or stop it from your board and the row updates live.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.assignmentsInProgress.heading', {
            defaultValue: 'Live Across the Team',
          })}
        </h3>
        <span className="text-xxs text-slate-400">
          {t('plcDashboard.assignmentsInProgress.count', {
            count: visible.length,
            defaultValue: '{{count}} running',
            defaultValue_other: '{{count}} running',
          })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((entry) => (
          <PlcAssignmentIndexRow key={entry.id} entry={entry} showStatusPill />
        ))}
      </div>
    </div>
  );
};
