/**
 * ActiveAssignmentsTile — Phase 3 bento tile for in-progress PLC
 * assignments. Surfaces the same data as the PLC Assignments → In-progress
 * sub-tab (status `'active'` or `'paused'`) in a compact list with a
 * count badge and an "Open assignments" footer that routes to the full
 * tab.
 *
 * **Why this tile exists:** Phase 3 shipped the In-progress sub-tab but
 * left the Overview bento tile pointing at the Phase-1 `ComingSoonTile`
 * (`tileRegistry.tsx`, pre-fix). Members landed on the dashboard and saw
 * a "Phase 3 · soon" badge even though the underlying tab was live. This
 * tile closes that gap so the Overview reflects the shipped feature set.
 *
 * Mirrors `QuizLibraryTile`'s rhythm (small heading + scrollable preview
 * + footer link) rather than `CompletedAssignmentsTile`'s analytics-body
 * embed — the In-progress view is a real-time list, not an aggregation.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, ChevronRight, Loader2 } from 'lucide-react';

import { Plc, PlcAssignmentIndexEntry, QuizAssignmentStatus } from '@/types';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import type { PlcDashboardTabId } from '../../PlcDashboard';

interface ActiveAssignmentsTileProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

const PREVIEW_LIMIT = 4;

export const ActiveAssignmentsTile: React.FC<ActiveAssignmentsTileProps> = ({
  plc,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const { entries, loading } = usePlcAssignmentIndex(plc.id);

  // The In-progress sub-tab uses the same filter — keep them in sync. If
  // the filter ever changes (e.g. a new `archived` status), update both.
  const active = useMemo(
    () => entries.filter((e) => e.status === 'active' || e.status === 'paused'),
    [entries]
  );
  const preview = active.slice(0, PREVIEW_LIMIT);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
          <ClipboardList className="w-3.5 h-3.5 text-brand-blue-primary" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.activeAssignments.heading', {
            defaultValue: 'Active Assignments',
          })}
        </h4>
        {active.length > 0 && (
          <span className="ml-auto text-xs font-bold text-slate-700">
            {active.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-2">
            <ClipboardList className="w-6 h-6 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.overview.tiles.activeAssignments.empty', {
                defaultValue: 'No active assignments',
              })}
            </p>
            <p className="text-xxs text-slate-400 mt-1">
              {t(
                'plcDashboard.overview.tiles.activeAssignments.emptySubtitle',
                {
                  defaultValue:
                    'Live PLC-mode assignments will appear here while they run.',
                }
              )}
            </p>
          </div>
        ) : (
          <ul className="space-y-2 py-1">
            {preview.map((entry) => (
              <ActiveAssignmentRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onNavigateTab('assignments')}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary hover:bg-brand-blue-lighter/40 transition-colors"
      >
        {t('plcDashboard.overview.tiles.activeAssignments.openAll', {
          defaultValue: 'Open assignments',
        })}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
};

const ActiveAssignmentRow: React.FC<{ entry: PlcAssignmentIndexEntry }> = ({
  entry,
}) => {
  const { t } = useTranslation();
  const ownerLabel = entry.ownerName?.trim() || entry.ownerEmail || '—';
  return (
    <li className="px-2 py-2 rounded-lg hover:bg-brand-blue-lighter/40 transition-colors">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-bold text-slate-800 truncate">
          {entry.title}
        </div>
        <StatusDot status={entry.status} />
      </div>
      <p className="text-xxs text-slate-500 truncate mt-0.5">
        {t('plcDashboard.overview.tiles.activeAssignments.byOwner', {
          name: ownerLabel,
          defaultValue: 'by {{name}}',
        })}
      </p>
    </li>
  );
};

/**
 * Compact status indicator — emerald dot for active, amber for paused.
 * Smaller than the full `StatusPill` used in the sub-tab row so it fits
 * the bento tile's tighter type scale.
 */
const StatusDot: React.FC<{ status: QuizAssignmentStatus }> = ({ status }) => {
  const { t } = useTranslation();
  if (status === 'active') {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700"
        title={t('plcDashboard.assignmentsInProgress.statusActive', {
          defaultValue: 'Active',
        })}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        {t('plcDashboard.assignmentsInProgress.statusActive', {
          defaultValue: 'Active',
        })}
      </span>
    );
  }
  return (
    <span
      className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700"
      title={t('plcDashboard.assignmentsInProgress.statusPaused', {
        defaultValue: 'Paused',
      })}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {t('plcDashboard.assignmentsInProgress.statusPaused', {
        defaultValue: 'Paused',
      })}
    </span>
  );
};
