import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  Trophy,
  Users,
} from 'lucide-react';
import type { Plc, PlcContribution } from '@/types';
import { usePlcContributions } from '@/hooks/usePlcContributions';
import { usePlcAssignments } from '@/hooks/usePlcAssignments';
import { PlcAggregateSection } from '@/components/common/library/PlcTab';
import {
  type SchemaGroup,
  aggregateGroup,
  groupBySchema,
} from '@/components/common/library/plcAnalyticsAggregate';

interface PlcAnalyticsBodyProps {
  plc: Plc;
  /**
   * Compact mode renders a tight summary (top N quizzes, no per-question
   * breakdown) suitable for a dashboard tile. Non-compact renders the
   * full cross-quiz analytics surface used by the fullscreen view.
   */
  compact?: boolean;
  /** Compact mode only — number of quizzes to surface in the preview. */
  previewLimit?: number;
}

interface QuizGroup {
  /** `syncGroupId` if present, else `quizId` — the cross-teacher quiz identity. */
  identity: string;
  title: string;
  contributions: PlcContribution[];
  schemaGroups: SchemaGroup[];
  /** Headline aggregate across ALL schema groups for this quiz. */
  headline: {
    averageScore: number | null;
    totalCompleted: number;
    totalTeachers: number;
  };
  /** Most-recent contribution timestamp — drives sort order. */
  latestUpdatedAt: number;
}

/**
 * Cross-quiz PLC analytics surface. Reads `PlcContribution`s for the PLC
 * (a single Firestore subscription, auto-published from `QuizResults`)
 * and groups them by quiz identity (`syncGroupId` preferred, falling back
 * to `quizId`). Each quiz card aggregates across all teachers who ran it
 * and expands into the per-quiz schema-drift breakdown rendered by the
 * existing `PlcAggregateSection`.
 *
 * Quiz titles are joined from `usePlcAssignments` (the templates each
 * member shared with the PLC). Contributions whose source quiz isn't in
 * the template list fall back to a generic label — they're still counted
 * in the totals so no data is hidden.
 */
export const PlcAnalyticsBody: React.FC<PlcAnalyticsBodyProps> = ({
  plc,
  compact = false,
  previewLimit = 4,
}) => {
  const {
    contributions,
    loading: contribsLoading,
    error,
  } = usePlcContributions(plc.id);
  const { templates, loading: templatesLoading } = usePlcAssignments(plc.id);

  const titleLookup = useMemo(() => {
    const byQuizId = new Map<string, string>();
    const bySyncGroupId = new Map<string, string>();
    for (const tpl of templates) {
      byQuizId.set(tpl.quizId, tpl.quizTitle);
      if (tpl.syncGroupId) bySyncGroupId.set(tpl.syncGroupId, tpl.quizTitle);
    }
    return { byQuizId, bySyncGroupId };
  }, [templates]);

  const quizGroups = useMemo<QuizGroup[]>(() => {
    const buckets = new Map<string, PlcContribution[]>();
    for (const c of contributions) {
      const identity = c.syncGroupId ?? c.quizId;
      const list = buckets.get(identity);
      if (list) list.push(c);
      else buckets.set(identity, [c]);
    }
    const groups: QuizGroup[] = [];
    for (const [identity, members] of buckets.entries()) {
      const schemaGroups = groupBySchema(members);
      const allQuestions = schemaGroups[0]?.questions ?? [];
      const aggregate = aggregateGroup(members, allQuestions);
      const sample = members[0];
      const title =
        titleLookup.bySyncGroupId.get(identity) ??
        titleLookup.byQuizId.get(sample?.quizId ?? '') ??
        sample?.questionsSnapshot[0]?.text?.slice(0, 60) ??
        'Untitled quiz';
      const latestUpdatedAt = members.reduce(
        (max, c) => (c.updatedAt > max ? c.updatedAt : max),
        0
      );
      groups.push({
        identity,
        title,
        contributions: members,
        schemaGroups,
        headline: {
          averageScore: aggregate.averageScore,
          totalCompleted: aggregate.totalCompleted,
          totalTeachers: aggregate.totalTeachers,
        },
        latestUpdatedAt,
      });
    }
    // Most-recent first.
    groups.sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
    return groups;
  }, [contributions, titleLookup]);

  const [expandedIdentity, setExpandedIdentity] = useState<string | null>(null);

  const loading = contribsLoading || templatesLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[120px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-brand-red-primary/20 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-brand-red-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-slate-800">
            Couldn&apos;t load PLC analytics
          </p>
          <p className="text-xxs text-slate-500 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  if (quizGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-6 px-4">
        <ClipboardList className="w-6 h-6 text-slate-300 mb-2" />
        <p className="font-semibold text-slate-600">No PLC results yet</p>
        <p className="text-xxs text-slate-400 mt-1">
          When a member runs a quiz with PLC mode and views results, the
          aggregate appears here automatically.
        </p>
      </div>
    );
  }

  const visibleGroups = compact
    ? quizGroups.slice(0, previewLimit)
    : quizGroups;
  const hiddenCount = compact
    ? Math.max(0, quizGroups.length - visibleGroups.length)
    : 0;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {visibleGroups.map((group) => {
        const isOpen = expandedIdentity === group.identity;
        const hasDrift = group.schemaGroups.length > 1;
        return (
          <div
            key={group.identity}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
          >
            <button
              type="button"
              onClick={() =>
                setExpandedIdentity(isOpen ? null : group.identity)
              }
              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
              aria-expanded={isOpen}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {group.title}
                  </span>
                  {hasDrift && (
                    <span
                      className="text-xxs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                      title="Members are on different versions of this quiz"
                    >
                      drift
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xxs text-slate-500 mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="w-3 h-3 text-amber-500" />
                    {group.headline.averageScore !== null
                      ? `${group.headline.averageScore}% avg`
                      : 'No score yet'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3 text-brand-blue-primary" />
                    {group.headline.totalTeachers}{' '}
                    {group.headline.totalTeachers === 1
                      ? 'teacher'
                      : 'teachers'}
                  </span>
                  <span>{group.headline.totalCompleted} students</span>
                </div>
              </div>
              {!compact &&
                (isOpen ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                ))}
            </button>
            {/* Drilldown — only available outside compact mode. The tile
                preview keeps the row clickable but defers the per-quiz
                detail to the fullscreen analytics surface. */}
            {!compact && isOpen && (
              <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                {group.schemaGroups.map((schemaGroup, idx) => (
                  <PlcAggregateSection
                    key={schemaGroup.schemaKey}
                    group={schemaGroup}
                    showHeader={hasDrift}
                    groupNumber={idx + 1}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {compact && hiddenCount > 0 && (
        <p className="text-xxs text-slate-400 italic px-1">
          +{hiddenCount} more
        </p>
      )}
    </div>
  );
};
