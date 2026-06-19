/**
 * PlcSharedDataBody — filterable results view for the PLC Shared Data section.
 *
 * Data flow:
 *   usePlcAssignmentIndex  →  index entries (drive the FILTER dropdown options:
 *                             type / teacher / specific-assignment / date)
 *   usePlcContributions    →  contribution docs (drive the RESULTS cards)
 *
 * Results cards are grouped by the contribution's OWN quiz identity
 * (`syncGroupId ?? quizId`) — the same grouping `PlcAnalyticsBody` /
 * `plcAnalyticsAggregate.groupBySchema` use. This is deliberate: the
 * assignment-index entry schema is locked and carries NO quizId/syncGroupId,
 * so there's no shared key to map a specific assignment to its contributions.
 * The old code linked them by `teacherUid === ownerUid` only, which
 * double-counted every contribution of a teacher who had 2+ assignments onto
 * EACH of their cards. Grouping by quiz identity counts each contribution
 * exactly once.
 *
 * Filters are still derived from the index entries (so the dropdowns list
 * every assignment/teacher/type) and applied at the correct granularity:
 *   - type: only 'quiz'/'all' surface results (contributions are quiz data;
 *     video activities don't write to the contributions collection)
 *   - teacher: keep quiz groups that include a contribution from that teacher
 *   - assignment: resolve the selected entry → its owner, keep quiz groups
 *     that include that owner (teacher granularity — the honest best-effort
 *     without a shared assignment↔contribution key)
 *   - date: keep quiz groups whose latest contribution falls in range
 *   - class period: filter the responses within each contribution
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trophy,
  Users,
} from 'lucide-react';
import type { Plc, PlcContribution } from '@/types';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { usePlcContributions } from '@/hooks/usePlcContributions';
import { PlcAggregateSection } from '@/components/common/library/PlcTab';
import { groupBySchema } from '@/components/common/library/plcAnalyticsAggregate';
import { PlcCommentsThread } from '@/components/plc/comments/PlcCommentsThread';
import { PlcSharedDataFilters } from './PlcSharedDataFilters';
import {
  filterContributionResponses,
  summarize,
  groupContributionsByQuizIdentity,
  type SharedDataFilters,
  type ContributionQuizGroup,
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
// ResultCard — one quiz-identity group's summary card
// ---------------------------------------------------------------------------

interface ResultCardProps {
  group: ContributionQuizGroup;
  plcId: string;
}

const ResultCard: React.FC<ResultCardProps> = ({ group, plcId }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const contributions = group.contributions;
  const summary = useMemo(() => summarize(contributions), [contributions]);

  const schemaGroups = useMemo(
    () => groupBySchema(contributions),
    [contributions]
  );

  const hasDrift = schemaGroups.length > 1;

  const title =
    group.title ||
    t('plcDashboard.sharedData.untitledQuiz', {
      defaultValue: 'Untitled quiz',
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
        {/* Kind badge — contributions are quiz results */}
        <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-blue-primary/10 shrink-0">
          <BookOpen className="w-4 h-4 text-brand-blue-primary" />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-800 truncate">
              {title}
            </span>
            <span className="text-xxs font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {t('plcDashboard.sharedData.kindQuiz', { defaultValue: 'Quiz' })}
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

      {/* Drilldown — per-quiz schema-drift breakdown (existing PlcAggregateSection) */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
          {schemaGroups.map((schemaGroup, idx) => (
            <PlcAggregateSection
              key={schemaGroup.schemaKey}
              group={schemaGroup}
              showHeader={hasDrift}
              groupNumber={idx + 1}
            />
          ))}
          {/* Scoped comments + @mentions on this data card (Decision 2.6,
              §6.2). The thread is keyed to the quiz identity so a card's
              discussion survives re-aggregation; the `assessment:` prefix
              forward-aligns the id with the Common Assessment object (Wave 3). */}
          <div className="border-t border-slate-200 pt-4">
            <PlcCommentsThread
              plcId={plcId}
              targetType="dataCard"
              targetId={`assessment:${group.identity}`}
              targetLabel={title}
            />
          </div>
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

  // Derived data for filter dropdowns. Teachers come from contributions
  // (only teachers with results matter for narrowing the result cards).
  const teachers = useMemo(
    () => collectTeachers(contributions),
    [contributions]
  );
  const classPeriods = useMemo(
    () => collectClassPeriods(contributions),
    [contributions]
  );

  // Best-effort title source: index entries owned by a single teacher. Used
  // only as a label hint when a quiz group has exactly one contributing
  // teacher (no quizId/syncGroupId on entries means we can't key on identity).
  const titleByOwnerUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (e.kind === 'quiz' && !map.has(e.ownerUid)) {
        map.set(e.ownerUid, e.title);
      }
    }
    return map;
  }, [entries]);

  // Resolve the selected assignment-index entry (for the assignment filter)
  // to its owner — the finest granularity we can apply to contributions,
  // which carry no assignment id.
  const selectedAssignmentOwnerUid = useMemo(() => {
    if (filters.assignmentId === 'all') return null;
    return entries.find((e) => e.id === filters.assignmentId)?.ownerUid ?? null;
  }, [entries, filters.assignmentId]);

  // Apply the class-period filter to responses first, then group the
  // contributions by quiz identity so each contribution is counted exactly
  // once on exactly one card.
  const filteredContributions = useMemo(
    () =>
      filterContributionResponses(contributions, {
        classPeriod: filters.classPeriod,
      }),
    [contributions, filters.classPeriod]
  );

  const quizGroups = useMemo(
    () =>
      groupContributionsByQuizIdentity(filteredContributions, titleByOwnerUid),
    [filteredContributions, titleByOwnerUid]
  );

  // Apply the entry-derived filters (type / teacher / assignment / date) to
  // the quiz groups at the correct granularity (see file header).
  const filteredGroups = useMemo(
    () =>
      quizGroups.filter((group) => {
        // Contributions are quiz data only — a video-activity type filter
        // matches no results here.
        if (filters.type === 'video-activity') return false;
        if (
          filters.teacherUid !== 'all' &&
          !group.teacherUids.has(filters.teacherUid)
        ) {
          return false;
        }
        if (
          selectedAssignmentOwnerUid !== null &&
          !group.teacherUids.has(selectedAssignmentOwnerUid)
        ) {
          return false;
        }
        if (filters.dateRange !== null) {
          const { from, to } = filters.dateRange;
          if (group.latestUpdatedAt < from || group.latestUpdatedAt > to) {
            return false;
          }
        }
        return true;
      }),
    [
      quizGroups,
      filters.type,
      filters.teacherUid,
      selectedAssignmentOwnerUid,
      filters.dateRange,
    ]
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
        : contribsError instanceof Error
          ? contribsError.message
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

  // Empty state — nothing shared at all (no assignment-index entries to
  // populate filters AND no contributions to aggregate into results).
  if (entries.length === 0 && contributions.length === 0) {
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

      {/* Results — one card per distinct quiz identity (no double-count) */}
      {filteredGroups.length === 0 ? (
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
          {filteredGroups.map((group) => (
            <ResultCard key={group.identity} group={group} plcId={plc.id} />
          ))}
        </div>
      )}
    </div>
  );
};
