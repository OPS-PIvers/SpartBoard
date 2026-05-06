import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, ExternalLink, Loader2 } from 'lucide-react';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { Plc } from '@/types';

interface PlcCompletedAssignmentsTabProps {
  plc: Plc;
}

/**
 * Defense-in-depth: only render the entry's `sheetUrl` as a link if it
 * parses as an `http:` or `https:` URL. The Firestore rule already pins
 * `sheetUrl` to the PLC's canonical `sharedSheetUrl`, but a stale entry
 * (or future schema change) shouldn't be able to smuggle a `javascript:`
 * URL through the dashboard.
 */
function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Read-only list of every PLC-mode assignment any member has run. Each
 * row links out to the shared Google Sheet that aggregates results.
 *
 * Phase 1 only renders the index — opening the sheet is the path to
 * detailed data. Later phases can inline aggregated stats here using
 * the same `readPlcSheet` machinery as `QuizWidget/PlcTab.tsx`.
 */
export const PlcCompletedAssignmentsTab: React.FC<
  PlcCompletedAssignmentsTabProps
> = ({ plc }) => {
  const { t } = useTranslation();
  const { entries, loading } = usePlcAssignmentIndex(plc.id);

  // Format a `createdAt` ms timestamp into a short locale date. Done inline
  // (no useMemo) since the list is small and the cost is trivial.
  const formatDate = (ms: number) => {
    try {
      return new Date(ms).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
          <ClipboardList className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">
          {t('plcDashboard.completedAssignments.emptyTitle', {
            defaultValue: 'No PLC assignments yet',
          })}
        </h3>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          {t('plcDashboard.completedAssignments.emptySubtitle', {
            defaultValue:
              "When you or a teammate runs a quiz with PLC mode on, it'll show up here with a link to the shared results sheet.",
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
            count: entries.length,
            defaultValue: '{{count}} assignment',
            defaultValue_other: '{{count}} assignments',
          })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {entries.map((entry) => {
          const ownerLabel = entry.ownerName?.trim() || entry.ownerEmail || '—';
          const safeSheetUrl = isSafeHttpUrl(entry.sheetUrl)
            ? entry.sheetUrl
            : null;
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-brand-blue-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 truncate">
                  {entry.title}
                </div>
                <div className="text-xxs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="truncate">
                    {t('plcDashboard.completedAssignments.byOwner', {
                      name: ownerLabel,
                      defaultValue: 'by {{name}}',
                    })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>{formatDate(entry.createdAt)}</span>
                </div>
              </div>
              {safeSheetUrl ? (
                <a
                  href={safeSheetUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t('plcDashboard.completedAssignments.openSheet', {
                    defaultValue: 'Open Sheet',
                  })}
                </a>
              ) : (
                <span
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xxs font-bold uppercase tracking-wider"
                  title={t('plcDashboard.completedAssignments.unsafeSheet', {
                    defaultValue: 'Sheet link unavailable',
                  })}
                >
                  {t('plcDashboard.completedAssignments.unsafeSheet', {
                    defaultValue: 'No link',
                  })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
