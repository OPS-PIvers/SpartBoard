import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, ExternalLink } from 'lucide-react';
import { PlcAssignmentIndexEntry, QuizAssignmentStatus } from '@/types';

interface PlcAssignmentIndexRowProps {
  entry: PlcAssignmentIndexEntry;
  /**
   * When true, render a colored status pill (Active / Paused). Used by
   * the In-progress sub-tab to disambiguate between live and paused
   * runs. Completed sub-tab leaves it off — every row there is
   * `inactive` by definition.
   */
  showStatusPill?: boolean;
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

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Single row rendering for a `PlcAssignmentIndexEntry`. Shared between
 * the In-progress and Completed sub-tabs so both views stay visually
 * identical — only the status filter and the optional status pill
 * differ.
 */
export const PlcAssignmentIndexRow: React.FC<PlcAssignmentIndexRowProps> = ({
  entry,
  showStatusPill,
}) => {
  const { t } = useTranslation();
  const ownerLabel = entry.ownerName?.trim() || entry.ownerEmail || '—';
  const safeSheetUrl = isSafeHttpUrl(entry.sheetUrl) ? entry.sheetUrl : null;
  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
        <ClipboardList className="w-4 h-4 text-brand-blue-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-bold text-slate-800 truncate">
            {entry.title}
          </div>
          {showStatusPill && <StatusPill status={entry.status} />}
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
};

const StatusPill: React.FC<{ status: QuizAssignmentStatus }> = ({ status }) => {
  const { t } = useTranslation();
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
        {t('plcDashboard.assignmentsInProgress.statusActive', {
          defaultValue: 'Active',
        })}
      </span>
    );
  }
  if (status === 'paused') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
        {t('plcDashboard.assignmentsInProgress.statusPaused', {
          defaultValue: 'Paused',
        })}
      </span>
    );
  }
  return null;
};
