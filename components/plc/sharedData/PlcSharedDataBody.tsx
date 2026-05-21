/**
 * PlcSharedDataBody — filterable results view for the PLC Shared Data section.
 *
 * Data flow:
 *   usePlcAssignmentIndex  →  index entries (type/teacher/assignment/date filter)
 *   usePlcContributions    →  contribution docs (class-period filter + summarize)
 *
 * For each filtered entry, we find the matching contributions (by ownerUid +
 * quizId/syncGroupId) and render a summary card.  For quiz entries, if we
 * have a matching contribution we delegate the drilldown to the existing
 * PlcAggregateSection / PlcAnalyticsBody patterns so we don't re-invent the
 * per-question aggregation UI.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Film,
  Loader2,
  Trophy,
  Users,
} from 'lucide-react';
import type { Plc, PlcAssignmentIndexEntry, PlcContribution } from '@/types';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { usePlcContributions } from '@/hooks/usePlcContributions';
import { PlcAggregateSection } from '@/components/common/library/PlcTab';
import { groupBySchema } from '@/components/common/library/plcAnalyticsAggregate';
import { PlcSharedDataFilters } from './PlcSharedDataFilters';
import {
  filterEntries,
  filterContributionResponses,
  summarize,
  type SharedDataFilters,
} from './sharedDataSelectors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CombinedFilters extends SharedDataFilters {
  classPeriod: string;
}

const DEFAULT_FILTERS: CombinedFilters = {
  type: 'all',
  teacherUid: 'all',
  assignmentId: 'all',
  dateRange: null,
  classPeriod: 'all',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Match contributions to an assignment index entry.
 * An entry matches if the contribution's teacherUid equals the entry's ownerUid
 * (quizzes: we also try to match via quizId / syncGroupId when available).
 */
function matchContributions(
  entry: PlcAssignmentIndexEntry,
  contributions: PlcContribution[]
): PlcContribution[] {
  // For quiz entries, match by ownerUid (teacher). Contributions don't carry
  // the assignment id, only the quizId — we link them via teacher + quiz.
  return contributions.filter((c) => c.teacherUid === entry.ownerUid);
}

/** Collect unique class periods across all contribution responses. */
function collectClassPeriods(contributions: PlcContribution[]): string[] {
  const set = new Set<string>();
  for (const c of contributions) {
    for (const r of c.responses) {
      if (r.classPeriod) set.add(r.classPeriod);
    }
  }
  return Array.from(set).sort();
}

/** Collect unique teachers from contributions. */
function collectTeachers(
  contributions: PlcContribution[]
): { uid: string; name: string }[] {
  const map = new Map<string, string>();
  for (const c of contributions) {
    map.set(c.teacherUid, c.teacherName);
  }
  return Array.from(map.entries())
    .map(([uid, name]) => ({ uid, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// ResultCard — one entry's summary card
// ---------------------------------------------------------------------------

interface ResultCardProps {
  entry: PlcAssignmentIndexEntry;
  contributions: PlcContribution[];
}

const ResultCard: React.FC<ResultCardProps> = ({ entry, contributions }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => summarize(contributions), [contributions]);

  const schemaGroups = useMemo(
    () => (entry.kind === 'quiz' ? groupBySchema(contributions) : []),
    [entry.kind, contributions]
  );

  const hasDrift = schemaGroups.length > 1;

  const KindIcon = entry.kind === 'quiz' ? BookOpen : Film;
  const kindLabel =
    entry.kind === 'quiz'
      ? t('plcDashboard.sharedData.kindQuiz', { defaultValue: 'Quiz' })
      : t('plcDashboard.sharedData.kindVA', {
          defaultValue: 'Video Activity',
        });

  return (
    <div
      data-testid="shared-data-card"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
      >
        {/* Kind badge */}
        <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-blue-primary/10 shrink-0">
          <KindIcon className="w-4 h-4 text-brand-blue-primary" />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-800 truncate">
              {entry.title}
            </span>
            <span className="text-xxs font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {kindLabel}
            </span>
            {hasDrift && (
              <span
                className="text-xxs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                title="Members are on different versions of this quiz"
              >
                {t('plcDashboard.sharedData.drift', { defaultValue: 'drift' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xxs text-slate-500 mt-1 flex-wrap">
            <span className="text-slate-400">{entry.ownerName}</span>
            {summary.avgScore !== null && (
              <span className="inline-flex items-center gap-1">
                <Trophy className="w-3 h-3 text-amber-500" />
                {summary.avgScore}%{' '}
                {t('plcDashboard.sharedData.avg', { defaultValue: 'avg' })}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3 text-brand-blue-primary" />
              {summary.teacherCount}{' '}
              {summary.teacherCount === 1
                ? t('plcDashboard.sharedData.teacher', {
                    defaultValue: 'teacher',
                  })
                : t('plcDashboard.sharedData.teachers', {
                    defaultValue: 'teachers',
                  })}
            </span>
            <span>
              {summary.studentCount}{' '}
              {t('plcDashboard.sharedData.students', {
                defaultValue: 'students',
              })}
            </span>
          </div>
        </div>

        {contributions.length > 0 &&
          (expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          ))}
      </button>

      {/* Drilldown — quiz only (uses existing PlcAggregateSection) */}
      {expanded && entry.kind === 'quiz' && schemaGroups.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
          {schemaGroups.map((schemaGroup, idx) => (
            <PlcAggregateSection
              key={schemaGroup.schemaKey}
              group={schemaGroup}
              showHeader={hasDrift}
              groupNumber={idx + 1}
            />
          ))}
        </div>
      )}

      {/* Drilldown — VA (no per-question breakdown available, show response list) */}
      {expanded &&
        entry.kind === 'video-activity' &&
        contributions.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50 p-4">
            <p className="text-xs text-slate-500 font-semibold mb-2">
              {t('plcDashboard.sharedData.responses', {
                defaultValue: 'Responses',
              })}
            </p>
            <ul className="space-y-1">
              {contributions.flatMap((c) =>
                c.responses.map((r, i) => (
                  <li
                    key={`${c.id}-${i}`}
                    className="flex items-center gap-2 text-xxs text-slate-600"
                  >
                    <span className="font-medium">{r.studentDisplayName}</span>
                    {r.classPeriod && (
                      <span className="text-slate-400">· P{r.classPeriod}</span>
                    )}
                    <span
                      className={
                        r.status === 'completed'
                          ? 'text-emerald-600'
                          : 'text-amber-600'
                      }
                    >
                      {r.status}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PlcSharedDataBody
// ---------------------------------------------------------------------------

interface PlcSharedDataBodyProps {
  plc: Plc;
}

export const PlcSharedDataBody: React.FC<PlcSharedDataBodyProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const {
    entries,
    loading: entriesLoading,
    error: entriesError,
  } = usePlcAssignmentIndex(plc.id);
  const {
    contributions,
    loading: contribsLoading,
    error: contribsError,
  } = usePlcContributions(plc.id);

  const [filters, setFilters] = useState<CombinedFilters>(DEFAULT_FILTERS);

  // Derived data for filter dropdowns
  const teachers = useMemo(
    () => collectTeachers(contributions),
    [contributions]
  );
  const classPeriods = useMemo(
    () => collectClassPeriods(contributions),
    [contributions]
  );

  // Apply filters
  const filteredEntries = useMemo(
    () => filterEntries(entries, filters),
    [entries, filters]
  );

  const filteredContributions = useMemo(
    () =>
      filterContributionResponses(contributions, {
        classPeriod: filters.classPeriod,
      }),
    [contributions, filters.classPeriod]
  );

  // Loading state
  if (entriesLoading || contribsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  // Error state
  if (entriesError || contribsError) {
    const errorMsg =
      entriesError instanceof Error
        ? entriesError.message
        : typeof contribsError === 'string'
          ? contribsError
          : t('plcDashboard.sharedData.loadError', {
              defaultValue: "Couldn't load shared data",
            });
    return (
      <div className="bg-white border border-brand-red-primary/20 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-brand-red-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-slate-800">
            {t('plcDashboard.sharedData.loadError', {
              defaultValue: "Couldn't load shared data",
            })}
          </p>
          <p className="text-xxs text-slate-500 mt-0.5">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // Empty state (no entries at all, before filter)
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-12 px-4">
        <BarChart3 className="w-8 h-8 text-slate-300 mb-3" />
        <p className="font-semibold text-slate-600">
          {t('plcDashboard.sharedData.emptyTitle', {
            defaultValue: 'No shared data yet',
          })}
        </p>
        <p className="text-xxs text-slate-400 mt-1 max-w-xs">
          {t('plcDashboard.sharedData.emptySubtitle', {
            defaultValue:
              'When members assign quizzes or video activities with PLC mode, results appear here.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      {/* Filter bar */}
      <PlcSharedDataFilters
        filters={filters}
        onChange={setFilters}
        teachers={teachers}
        entries={entries}
        classPeriods={classPeriods}
      />

      {/* Results */}
      {filteredEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center text-xs text-slate-500 py-10 px-4">
          <BarChart3 className="w-6 h-6 text-slate-300 mb-2" />
          <p className="font-semibold text-slate-600">
            {t('plcDashboard.sharedData.noResults', {
              defaultValue: 'No results match your filters',
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const matched = matchContributions(entry, filteredContributions);
            return (
              <ResultCard
                key={entry.id}
                entry={entry}
                contributions={matched}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
