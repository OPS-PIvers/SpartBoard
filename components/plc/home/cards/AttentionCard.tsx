/**
 * AttentionCard — surfaces active + paused PLC assignments ("needs
 * attention") and a count of recent results contributions.
 *
 * Data sources:
 *   usePlcAssignmentIndex → entries filtered to status==='active'||'paused'
 *   usePlcContributions   → count of contributions (recent results)
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  ChevronRight,
  ExternalLink,
  Loader2,
  BarChart3,
  AlertCircle,
} from 'lucide-react';

import type { Plc, PlcAssignmentIndexEntry } from '@/types';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { usePlcContributions } from '@/hooks/usePlcContributions';
import type { PlcSectionId } from '@/components/plc/sections';

interface AttentionCardProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const PREVIEW_LIMIT = 5;

export const AttentionCard: React.FC<AttentionCardProps> = ({
  plc,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const {
    entries,
    loading,
    error: entriesError,
  } = usePlcAssignmentIndex(plc.id);
  const { contributions, error: contribsError } = usePlcContributions(plc.id);

  const active = useMemo(
    () => entries.filter((e) => e.status === 'active' || e.status === 'paused'),
    [entries]
  );
  const preview = active.slice(0, PREVIEW_LIMIT);
  const recentResultsCount = contributions.length;
  // Surface load failures instead of the misleading "No active assignments"
  // empty state — an empty `entries` array on error doesn't mean there are no
  // assignments, just that we couldn't read them.
  const hasError = entriesError !== null || contribsError !== null;

  return (
    <div className="flex flex-col bg-white/70 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <div className="w-8 h-8 rounded-xl bg-brand-blue-lighter flex items-center justify-center shrink-0">
          <ClipboardList
            className="w-4 h-4 text-brand-blue-primary"
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {t('plcDashboard.home.attention.heading', {
              defaultValue: 'Active Assignments',
            })}
          </h3>
        </div>
        {active.length > 0 && (
          <span className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-brand-blue-primary text-white text-xs font-bold">
            {active.length}
          </span>
        )}
      </div>

      {/* Results hint */}
      {recentResultsCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('sharedData')}
          className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors text-left"
        >
          <BarChart3 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {t('plcDashboard.home.attention.results', {
              count: recentResultsCount,
              defaultValue: `${recentResultsCount} result set${recentResultsCount !== 1 ? 's' : ''} available`,
            })}
          </span>
          <ChevronRight
            className="w-3 h-3 ml-auto shrink-0"
            aria-hidden="true"
          />
        </button>
      )}

      {/* Assignment list */}
      <div className="flex-1 min-h-0 px-4 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          </div>
        ) : hasError ? (
          <div
            className="flex flex-col items-center justify-center py-8 text-center"
            role="alert"
          >
            <AlertCircle
              className="w-8 h-8 text-brand-red-primary/70 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-600">
              {t('plcDashboard.home.attention.loadError', {
                defaultValue: "Couldn't load assignments",
              })}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t('plcDashboard.home.attention.loadErrorSubtitle', {
                defaultValue: 'Check your connection and try again.',
              })}
            </p>
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ClipboardList
              className="w-8 h-8 text-slate-200 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-500">
              {t('plcDashboard.home.attention.empty', {
                defaultValue: 'No active assignments',
              })}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t('plcDashboard.home.attention.emptySubtitle', {
                defaultValue: 'Live PLC assignments will appear here.',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {preview.map((entry) => (
              <AttentionRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>

      {/* Footer CTA */}
      <button
        type="button"
        onClick={() => onNavigate('assessments')}
        className="flex items-center justify-center gap-1.5 px-5 py-3 border-t border-slate-100 text-xs font-bold uppercase tracking-wider text-brand-blue-primary hover:bg-brand-blue-lighter/40 transition-colors"
      >
        {t('plcDashboard.home.attention.openAll', {
          defaultValue: 'View all assignments',
        })}
        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

const AttentionRow: React.FC<{ entry: PlcAssignmentIndexEntry }> = ({
  entry,
}) => {
  const { t } = useTranslation();
  const ownerLabel = entry.ownerName?.trim() || entry.ownerEmail || '—';
  const safeSheetUrl = isSafeHttpUrl(entry.sheetUrl) ? entry.sheetUrl : null;
  const isActive = entry.status === 'active';

  return (
    <li className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
      <span
        className={`shrink-0 w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-400'}`}
        title={
          isActive
            ? t('plcDashboard.assignmentsInProgress.statusActive', {
                defaultValue: 'Active',
              })
            : t('plcDashboard.assignmentsInProgress.statusPaused', {
                defaultValue: 'Paused',
              })
        }
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">
          {entry.title}
        </p>
        <p className="text-xs text-slate-500 truncate">
          {t('plcDashboard.home.attention.byOwner', {
            name: ownerLabel,
            defaultValue: `by ${ownerLabel}`,
          })}
        </p>
      </div>
      {safeSheetUrl && (
        <a
          href={safeSheetUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 p-1.5 text-slate-400 hover:text-brand-blue-primary rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={t('plcDashboard.home.attention.openSheet', {
            defaultValue: 'Open results sheet',
          })}
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      )}
    </li>
  );
};
