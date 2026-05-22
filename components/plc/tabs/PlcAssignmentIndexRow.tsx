import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ClipboardList,
  Copy,
  ExternalLink,
  LineChart,
} from 'lucide-react';
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
  /**
   * Open the live monitor for this assignment (owner only, quiz only).
   * When undefined the Monitor button is not rendered.
   */
  onMonitor?: () => void;
  /**
   * Open the results view for this assignment (owner only, quiz only).
   * When undefined the Results button is not rendered.
   */
  onResults?: () => void;
  /**
   * Copy this assignment to the current user's own board (non-owner).
   * When undefined the "Assign to my classes" button is not rendered.
   */
  onAssignToMyClasses?: () => void;
  /**
   * When true, show a spinner/disabled state on the "Assign to my
   * classes" button (import in flight).
   */
  isBusy?: boolean;
}

/**
 * Defense-in-depth: only render the entry's `sheetUrl` as a link if it
 * parses as an `http:` or `https:` URL. The Firestore rule already pins
 * `sheetUrl` to the trusted Google Sheets domain, but a stale entry
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
 * identical — only the status filter, the optional status pill, and the
 * per-row actions (Monitor / Results / Assign to my classes) differ.
 */
export const PlcAssignmentIndexRow: React.FC<PlcAssignmentIndexRowProps> = ({
  entry,
  showStatusPill,
  onMonitor,
  onResults,
  onAssignToMyClasses,
  isBusy,
}) => {
  const { t } = useTranslation();
  const ownerLabel = entry.ownerName?.trim() || entry.ownerEmail || '—';
  const safeSheetUrl = isSafeHttpUrl(entry.sheetUrl) ? entry.sheetUrl : null;

  const hasActions = onMonitor ?? onResults ?? onAssignToMyClasses;

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

      {/* Action buttons — vary based on ownership and available callbacks */}
      <div className="shrink-0 flex items-center gap-1.5">
        {onMonitor && (
          <button
            type="button"
            onClick={onMonitor}
            data-testid="row-action-monitor"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors"
            title={t('plcDashboard.assignmentsInProgress.monitorTitle', {
              defaultValue: 'Open live monitor',
            })}
          >
            <Activity className="w-3 h-3" aria-hidden="true" />
            {t('plcDashboard.assignmentsInProgress.monitorLabel', {
              defaultValue: 'Monitor',
            })}
          </button>
        )}
        {onResults && (
          <button
            type="button"
            onClick={onResults}
            data-testid="row-action-results"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors"
            title={t('plcDashboard.assignmentsInProgress.resultsTitle', {
              defaultValue: 'View results',
            })}
          >
            <LineChart className="w-3 h-3" aria-hidden="true" />
            {t('plcDashboard.assignmentsInProgress.resultsLabel', {
              defaultValue: 'Results',
            })}
          </button>
        )}
        {onAssignToMyClasses && (
          <button
            type="button"
            onClick={isBusy ? undefined : onAssignToMyClasses}
            disabled={isBusy}
            data-testid="row-action-assign-to-my-classes"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t(
              'plcDashboard.assignmentsInProgress.assignToMyClassesTitle',
              {
                defaultValue: 'Copy this assignment to your own board',
              }
            )}
          >
            <Copy className="w-3 h-3" aria-hidden="true" />
            {t('plcDashboard.assignmentsInProgress.assignToMyClassesLabel', {
              defaultValue: 'Assign to my classes',
            })}
          </button>
        )}
        {/* Always show Open Sheet as a secondary fallback action */}
        {!hasActions && safeSheetUrl && (
          <a
            href={safeSheetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {t('plcDashboard.completedAssignments.openSheet', {
              defaultValue: 'Open Sheet',
            })}
          </a>
        )}
        {/* When actions are present and a sheet URL exists, show it as a small icon link */}
        {hasActions && safeSheetUrl && (
          <a
            href={safeSheetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter transition-colors"
            title={t('plcDashboard.completedAssignments.openSheet', {
              defaultValue: 'Open Sheet',
            })}
            aria-label={t('plcDashboard.completedAssignments.openSheet', {
              defaultValue: 'Open Sheet',
            })}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {!hasActions && !safeSheetUrl && (
          <span
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xxs font-bold uppercase tracking-wider"
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
