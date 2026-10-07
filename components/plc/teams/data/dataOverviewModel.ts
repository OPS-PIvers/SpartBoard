// PLC Data overview view-model (TEAMS_REDESIGN T16–T21): one featured assessment plus cross-assessment rollups.

import type {
  LearningTarget,
  PlcAggregateTargetRow,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  TeamHeroRef,
} from '@/types';
import { assessmentRunDate } from '@/components/plc/home/tiles/resultsSelectors';
import { firstNonEmpty } from '@/components/plc/assessments/assessmentListSelectors';
import {
  DEFAULT_MASTERY_CUTOFFS,
  type MasteryCutoffs,
} from '@/utils/learningTargets';
import {
  buildItemAnalysis,
  buildMasteryByTarget,
  buildParticipation,
  buildScoreDistribution,
  buildTeamTrend,
  type ItemAnalysis,
  type MasteryByTarget,
  type MasteryRow,
  type ParticipationRow,
  type ScoreDistribution,
  type TeamTrendPoint,
} from '@/utils/plcDataOverview';

export const TREND_LIMIT = 8;
export const PARTICIPATION_LIMIT = 6;
export const RECENT_LIMIT = 4;
const SHORT_TITLE_MAX = 12;

export interface FeaturedAssessment {
  assessmentId: string;
  title: string;
  shortTitle: string;
  /** The assessment's own date, or the aggregate's `ranAt` when the record is gone. */
  date: number;
  questionCount: number;
  pinned: boolean;
  itemAnalysis: ItemAnalysis;
  distribution: ScoreDistribution;
  /** Mastery on this assessment's tagged questions only. */
  mastery: MasteryByTarget;
  /** questionId → target code (or label) for the item-analysis tooltip. */
  targetOf: Record<string, string>;
  /** targetId → how many of this assessment's questions carry the tag. */
  questionsPerTarget: Record<string, number>;
}

/** The mastery layer: the featured assessment when tagged, else the newest tagged one. */
export interface MasteryLayer {
  assessmentId: string;
  title: string;
  mastery: Extract<MasteryByTarget, { tagged: true }>;
  questionsPerTarget: Record<string, number>;
}

export interface RecentAssessmentRow {
  assessmentId: string;
  title: string;
  date: number;
  teamAveragePercent: number;
  scoredStudents: number | null;
  totalStudents: number;
}

export interface DataOverviewModel {
  featured: FeaturedAssessment | null;
  /** Null when no scored assessment has tagged questions (T18). */
  mastery: MasteryLayer | null;
  /** A newer scored assessment than the pinned one (T6 nudge). */
  newer: { assessmentId: string; title: string; date: number } | null;
  /** Oldest first. */
  trend: TeamTrendPoint[];
  /** Oldest first, assessments with an aggregate only. */
  participation: ParticipationRow[];
  /** Newest first. */
  recent: RecentAssessmentRow[];
  shortTitles: Record<string, string>;
  cutoffs: MasteryCutoffs;
}

export interface DataOverviewInput {
  aggregates: readonly PlcAssessmentAggregate[];
  assessments: readonly PlcCommonAssessment[];
  targets: readonly LearningTarget[];
  cutoffs?: MasteryCutoffs;
  /** Members who teach; viewers excluded. */
  teacherUids: readonly string[];
  heroRef: TeamHeroRef | null;
  /** Fixture override for chart labels. */
  shortTitles?: Record<string, string>;
}

/** Axis label for an assessment: its unit label, else a clipped title. */
export function shortTitleFor(
  title: string,
  assessment?: PlcCommonAssessment | null
): string {
  const unit = assessment?.unitLabel?.trim();
  if (unit) return unit;
  if (title.length <= SHORT_TITLE_MAX) return title;
  return `${title.slice(0, SHORT_TITLE_MAX - 1).trimEnd()}…`;
}

function tagRows(aggregate: PlcAssessmentAggregate): PlcAggregateTargetRow[] {
  const targets = (aggregate.perTarget ?? []).filter(
    (r) => r.kind !== 'standard'
  );
  return [...targets, ...(aggregate.perStandard ?? [])];
}

function buildFeatured(
  aggregate: PlcAssessmentAggregate,
  assessment: PlcCommonAssessment | null,
  input: DataOverviewInput,
  shortTitles: Record<string, string>,
  cutoffs: MasteryCutoffs,
  pinned: boolean
): FeaturedAssessment {
  const title = firstNonEmpty([assessment?.title, aggregate.title]) ?? '';
  const targetOf: Record<string, string> = {};
  const questionsPerTarget: Record<string, number> = {};
  const byId = new Map(input.targets.map((t) => [t.id, t]));
  for (const row of tagRows(aggregate)) {
    questionsPerTarget[row.targetId] = row.questionIds.length;
    const current = byId.get(row.targetId);
    const name = current?.code ?? row.code ?? current?.label ?? row.label;
    for (const q of row.questionIds) targetOf[q] ??= name;
  }
  return {
    assessmentId: aggregate.assessmentId,
    title,
    shortTitle:
      shortTitles[aggregate.assessmentId] ?? shortTitleFor(title, assessment),
    date: assessment ? assessmentRunDate(assessment) : aggregate.ranAt,
    questionCount: aggregate.perQuestion.length,
    pinned,
    itemAnalysis: buildItemAnalysis(aggregate, {
      reteachBelowPercent: cutoffs.proficient,
    }),
    distribution: buildScoreDistribution(aggregate),
    mastery: buildMasteryByTarget([aggregate], input.targets, {
      ...(assessment ? { assessments: [assessment] } : {}),
      cutoffs,
    }),
    targetOf,
    questionsPerTarget,
  };
}

export function buildDataOverviewModel(
  input: DataOverviewInput
): DataOverviewModel {
  const cutoffs = input.cutoffs ?? DEFAULT_MASTERY_CUTOFFS;
  const assessmentsById = new Map(input.assessments.map((a) => [a.id, a]));
  const aggregatesById = new Map(
    input.aggregates.map((a) => [a.assessmentId, a])
  );
  const allTrend = buildTeamTrend(input.aggregates, input.assessments);
  const shortTitles: Record<string, string> = {};
  for (const p of allTrend) {
    shortTitles[p.assessmentId] =
      input.shortTitles?.[p.assessmentId] ??
      shortTitleFor(p.title, assessmentsById.get(p.assessmentId));
  }

  const latest = allTrend[allTrend.length - 1] ?? null;
  const pinnedId =
    input.heroRef?.kind === 'assessment' ? input.heroRef.assessmentId : null;
  const pinnedAggregate = pinnedId ? aggregatesById.get(pinnedId) : undefined;
  const pinnedAssessment = pinnedId ? assessmentsById.get(pinnedId) : undefined;
  const pinnedLive =
    !!pinnedAggregate && pinnedAssessment?.deletedAt == null && !!pinnedId;
  const featuredId = pinnedLive ? pinnedId : (latest?.assessmentId ?? null);
  const featuredAggregate = featuredId
    ? aggregatesById.get(featuredId)
    : undefined;
  const featured = featuredAggregate
    ? buildFeatured(
        featuredAggregate,
        assessmentsById.get(featuredAggregate.assessmentId) ?? null,
        input,
        { ...shortTitles, ...input.shortTitles },
        cutoffs,
        pinnedLive
      )
    : null;

  let mastery: MasteryLayer | null = null;
  if (featured?.mastery.tagged) {
    mastery = {
      assessmentId: featured.assessmentId,
      title: featured.title,
      mastery: featured.mastery,
      questionsPerTarget: featured.questionsPerTarget,
    };
  } else {
    for (const p of [...allTrend].reverse()) {
      const aggregate = aggregatesById.get(p.assessmentId);
      if (!aggregate || tagRows(aggregate).length === 0) continue;
      const built = buildFeatured(
        aggregate,
        assessmentsById.get(p.assessmentId) ?? null,
        input,
        shortTitles,
        cutoffs,
        false
      );
      if (built.mastery.tagged) {
        mastery = {
          assessmentId: built.assessmentId,
          title: built.title,
          mastery: built.mastery,
          questionsPerTarget: built.questionsPerTarget,
        };
      }
      break;
    }
  }

  const newer =
    featured?.pinned &&
    latest &&
    latest.assessmentId !== featured.assessmentId &&
    latest.date > featured.date
      ? {
          assessmentId: latest.assessmentId,
          title: latest.title,
          date: latest.date,
        }
      : null;

  const participationAll = buildParticipation({
    aggregates: input.aggregates,
    assessments: input.assessments,
    teacherUids: input.teacherUids,
  });
  const participation = participationAll.rows
    .filter((r) => aggregatesById.has(r.assessmentId))
    .slice(0, PARTICIPATION_LIMIT)
    .reverse();
  for (const r of participation) {
    shortTitles[r.assessmentId] ??=
      input.shortTitles?.[r.assessmentId] ??
      shortTitleFor(r.title, assessmentsById.get(r.assessmentId));
  }

  const recent = [...allTrend]
    .reverse()
    .slice(0, RECENT_LIMIT)
    .map((p) => ({
      assessmentId: p.assessmentId,
      title: p.title,
      date: p.date,
      teamAveragePercent: p.teamAveragePercent,
      scoredStudents: p.scoredStudents,
      totalStudents: aggregatesById.get(p.assessmentId)?.studentCount ?? 0,
    }));

  return {
    featured,
    mastery,
    newer,
    trend: allTrend.slice(-TREND_LIMIT),
    participation,
    recent,
    shortTitles,
    cutoffs,
  };
}

/** A learning target's percent correct per assessment, across every tagged assessment (T5 target hero). */
export function findTargetMastery(
  input: Pick<
    DataOverviewInput,
    'aggregates' | 'assessments' | 'targets' | 'cutoffs'
  >,
  targetId: string
): MasteryRow | null {
  const mastery = buildMasteryByTarget(input.aggregates, input.targets, {
    assessments: input.assessments,
    cutoffs: input.cutoffs ?? DEFAULT_MASTERY_CUTOFFS,
  });
  if (!mastery.tagged) return null;
  return (
    [...mastery.targets, ...mastery.standards].find(
      (r) => r.targetId === targetId
    ) ?? null
  );
}

/** Each scored assessment's questions with their target tag, newest first, for Manage targets. */
export function buildTagQuestionSets(
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[]
): {
  assessmentId: string;
  title: string;
  questions: { questionId: string; text: string; targetId: string | null }[];
}[] {
  const byId = new Map(aggregates.map((a) => [a.assessmentId, a]));
  return [...buildTeamTrend(aggregates, assessments)].reverse().flatMap((p) => {
    const aggregate = byId.get(p.assessmentId);
    if (!aggregate || aggregate.perQuestion.length === 0) return [];
    const tagOf = new Map<string, string>();
    for (const row of tagRows(aggregate)) {
      for (const q of row.questionIds) {
        if (!tagOf.has(q)) tagOf.set(q, row.targetId);
      }
    }
    return [
      {
        assessmentId: p.assessmentId,
        title: p.title,
        questions: aggregate.perQuestion.map((q) => ({
          questionId: q.questionId,
          text: q.text,
          targetId: tagOf.get(q.questionId) ?? null,
        })),
      },
    ];
  });
}

/** Open action items across live notes, and how many are the viewer's. */
export function countOpenItems(
  notes: readonly {
    deletedAt?: number | null;
    actionItems?: { done: boolean; assigneeUid?: string | null }[];
  }[],
  uid: string | null
): { total: number; mine: number } {
  let total = 0;
  let mine = 0;
  for (const note of notes) {
    if (note.deletedAt != null) continue;
    for (const item of note.actionItems ?? []) {
      if (item.done) continue;
      total++;
      if (uid && item.assigneeUid === uid) mine++;
    }
  }
  return { total, mine };
}
