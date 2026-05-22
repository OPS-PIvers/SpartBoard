import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader2 } from 'lucide-react';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { Plc } from '@/types';
import { PlcAssignmentIndexRow } from './PlcAssignmentIndexRow';

interface PlcAssignmentsCompletedSubTabProps {
  plc: Plc;
  /**
   * Optional kind filter. When provided, only index entries whose `kind`
   * matches are shown — used by the Quizzes section's Completed sub-tab to
   * scope the shared assignment index to quiz rows. Omitted on the
   * standalone Assignments page, where all kinds are shown.
   */
  kindFilter?: 'quiz' | 'video-activity';
}

/**
 * Completed sub-tab — read-only history of every PLC-mode assignment
 * any member ever ran (status `'inactive'`). Each row links out to the
 * shared Google Sheet that aggregates results. Replaces the
 * pre-Phase-3 top-level "Completed Assignments" tab; same data, scoped
 * filter, no behavioral change.
 */
export const PlcAssignmentsCompletedSubTab: React.FC<
  PlcAssignmentsCompletedSubTabProps
> = ({ plc, kindFilter }) => {
  const { t } = useTranslation();
  const { entries, loading } = usePlcAssignmentIndex(plc.id);

  const visible = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.status === 'inactive' &&
          (kindFilter === undefined || e.kind === kindFilter)
      ),
    [entries, kindFilter]
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
          {t('plcDashboard.completedAssignments.emptyTitle', {
            defaultValue: 'No completed assignments yet',
          })}
        </h3>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          {t('plcDashboard.completedAssignments.emptySubtitle', {
            defaultValue:
              "When a PLC-mode assignment is stopped from any teammate's board, it lands here with a link to the shared results sheet.",
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.completedAssignments.heading', {
            defaultValue: 'Shared Results',
          })}
        </h3>
        <span className="text-xxs text-slate-400">
          {t('plcDashboard.completedAssignments.count', {
            count: visible.length,
            defaultValue: '{{count}} assignment',
            defaultValue_other: '{{count}} assignments',
          })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((entry) => (
          <PlcAssignmentIndexRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
};
