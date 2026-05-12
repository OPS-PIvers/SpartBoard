import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList } from 'lucide-react';
import { Plc } from '@/types';
import { PlcAnalyticsBody } from '../../bodies/PlcAnalyticsBody';

interface CompletedAssignmentsTileProps {
  plc: Plc;
}

/**
 * Tile-mode preview of cross-PLC analytics. Renders `PlcAnalyticsBody` in
 * compact mode (top-N quiz cards, headline numbers only). The fullscreen
 * expand affordance — wired by `PlcGridLayout` for the
 * `completedAssignments` kind — opens the same body without the compact
 * cap so teachers can drill into the per-quiz schema-drift breakdown.
 *
 * The legacy navigate-to-tab footer button is gone. Phase 2's fullscreen
 * expansion replaces it; the v1 tab still renders the same body via
 * `PlcAssignmentsTab` for backward compat.
 */
export const CompletedAssignmentsTile: React.FC<
  CompletedAssignmentsTileProps
> = ({ plc }) => {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
          <ClipboardList className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.completedAssignments.heading', {
            defaultValue: 'PLC Analytics',
          })}
        </h4>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-3">
        <PlcAnalyticsBody plc={plc} compact previewLimit={4} />
      </div>
    </div>
  );
};
