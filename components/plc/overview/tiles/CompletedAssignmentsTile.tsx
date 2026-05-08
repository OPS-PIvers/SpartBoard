import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ClipboardList, Loader2 } from 'lucide-react';
import { Plc } from '@/types';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import type { PlcDashboardTabId } from '../../PlcDashboard';

interface CompletedAssignmentsTileProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

const PREVIEW_LIMIT = 4;

function formatDate(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export const CompletedAssignmentsTile: React.FC<
  CompletedAssignmentsTileProps
> = ({ plc, onNavigateTab }) => {
  const { t } = useTranslation();
  const { entries, loading } = usePlcAssignmentIndex(plc.id);
  const preview = entries.slice(0, PREVIEW_LIMIT);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
          <ClipboardList className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.completedAssignments.heading', {
            defaultValue: 'Recent results',
          })}
        </h4>
        {entries.length > 0 && (
          <span className="ml-auto text-xs font-bold text-slate-700">
            {entries.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-4">
            <ClipboardList className="w-6 h-6 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.overview.tiles.completedAssignments.empty', {
                defaultValue: 'No assignments run yet',
              })}
            </p>
            <p className="text-xxs text-slate-400 mt-1">
              {t(
                'plcDashboard.overview.tiles.completedAssignments.emptySubtitle',
                {
                  defaultValue: 'Quizzes you run with PLC mode appear here.',
                }
              )}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5 py-1">
            {preview.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {entry.title}
                  </div>
                  <div className="text-xxs text-slate-500 truncate">
                    {entry.ownerName?.trim() || entry.ownerEmail || '—'}
                    {' • '}
                    {formatDate(entry.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onNavigateTab('assignments')}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary hover:bg-brand-blue-lighter/30 transition-colors"
      >
        {t('plcDashboard.overview.tiles.completedAssignments.viewAll', {
          defaultValue: 'View all',
        })}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
};
