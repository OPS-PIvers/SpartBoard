// Pure view-models for the PLC Data overview (TEAMS_REDESIGN T16–T19); team-level only, never per class or teacher.

import type {
  LearningTarget,
  LearningTargetKind,
  PlcAggregateTargetRow,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
} from '@/types';
import {
  firstNonEmpty,
  hasTeamAverage,
  teacherPoolSize,
} from '@/components/plc/assessments/assessmentListSelectors';
import { assessmentRunDate } from '@/components/plc/home/tiles/resultsSelectors';
import {
  DEFAULT_MASTERY_CUTOFFS,
  type MasteryCutoffs,
} from '@/utils/learningTargets';
import { masteryBandFor, type MasteryBand } from '@/utils/quizTargetStats';
import { SCORE_DISTRIBUTION_BANDS } from '@/utils/scoreColor';

export type PlcAggregateQuestion =
  PlcAssessmentAggregate['perQuestion'][number];

/** Below this many served attempts a question is hidden, matching the assessment detail page. */
export const MIN_SERVED_FOR_QUESTION = 5;
/** Below this many graded answers a target row has no mastery band. */
export const MIN_ATTEMPTED_FOR_MASTERY = 5;
export const DEFAULT_RETEACH_LIMIT = 3;

const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, value));

// Item analysis (T19)

export interface DominantWrongAnswer {
  /** Answer-option text (never student text). */
  label: string;
  count: number;
  /** Share of answering students who picked it, 0-100. */
  percent: number;
}

export interface ItemAnalysisQuestion {
  questionId: string;
  text: string;
  /** 1-based position in the assessment, kept when re-sorted. */
  number: number;
  scoring: 'points' | 'binary';
  /** `pending` until scores are published; `correctPercent` is then null, never 0. */
  status: 'scored' | 'pending';
  /** Percent correct, or average percent of points for `points` questions. */
  correctPercent: number | null;
  answered: number;
  dominantWrong?: DominantWrongAnswer;
  reteach: boolean;
}

export interface ParticipationSummary {
  /** Null on legacy aggregates that predate scored-student counts. */
  scoredStudents: number | null;
  totalStudents: number;
  /** scoredStudents / totalStudents, 0-100; null when either is unknown or zero. */
  percent: number | null;
}

export interface ItemAnalysisHeadline {
  /** Null until any scores are published. */
  teamAveragePercent: number | null;
  participation: ParticipationSummary;
  contributorCount: number;
}

export interface ItemAnalysis {
  headline: ItemAnalysisHeadline;
  /** Reteach questions first, then the rest by lowest percent; pending last in quiz order. */
  questions: ItemAnalysisQuestion[];
  reteachCount: number;
  /** Questions hidden because too few students were served them. */
  hiddenLowSampleCount: number;
}

export interface ItemAnalysisOptions {
  reteachLimit?: number;
  /** Only questions below this percent are flagged for reteach. */
  reteachBelowPercent?: number;
}

/** Pending when graded answers are explicitly zero; schema 1 docs carry neither field and count as scored. */
export function isQuestionPending(question: PlcAggregateQuestion): boolean {
  if (question.incorrectPercent === null) return true;
  if (question.incorrectPercent === undefined) return question.graded === 0;
  return false;
}

/** Most-picked incorrect option; omitted when no option is known correct or nobody chose a wrong one. */
export function dominantWrongAnswer(
  question: PlcAggregateQuestion
): DominantWrongAnswer | undefined {
  const rows = question.choiceDistribution ?? [];
  if (!rows.some((r) => r.isCorrect)) return undefined;
  let top: (typeof rows)[number] | undefined;
  for (const row of rows) {
    if (row.isCorrect || row.count <= 0) continue;
    if (!top || row.count > top.count) top = row;
  }
  if (!top) return undefined;
  const denominator =
    question.answered && question.answered > 0
      ? question.answered
      : rows.reduce((sum, r) => sum + r.count, 0);
  return {
    label: top.label,
    count: top.count,
    percent:
      denominator > 0
        ? clampPercent(Math.round((top.count / denominator) * 100))
        : 0,
  };
}

export function buildParticipationSummary(
  aggregate: PlcAssessmentAggregate
): ParticipationSummary {
  const scored =
    typeof aggregate.scoredStudentCount === 'number'
      ? aggregate.scoredStudentCount
      : null;
  const total = aggregate.studentCount;
  return {
    scoredStudents: scored,
    totalStudents: total,
    percent:
      scored !== null && total > 0
        ? clampPercent(Math.round((scored / total) * 100))
        : null,
  };
}

function contributorCount(aggregate: PlcAssessmentAggregate): number {
  return aggregate.contributorUids.length || aggregate.teacherCount;
}

function compareItems(a: ItemAnalysisQuestion, b: ItemAnalysisQuestion) {
  if (a.correctPercent === null || b.correctPercent === null) {
    if (a.correctPercent !== b.correctPercent) {
      return a.correctPercent === null ? 1 : -1;
    }
    return a.number - b.number;
  }
  return (
    a.correctPercent - b.correctPercent ||
    (b.dominantWrong?.percent ?? 0) - (a.dominantWrong?.percent ?? 0) ||
    a.number - b.number
  );
}

/** T19 hero: per-question percent correct with the dominant wrong answer, reteach questions first. */
export function buildItemAnalysis(
  aggregate: PlcAssessmentAggregate,
  options: ItemAnalysisOptions = {}
): ItemAnalysis {
  const limit = Math.max(0, options.reteachLimit ?? DEFAULT_RETEACH_LIMIT);
  const below =
    options.reteachBelowPercent ?? DEFAULT_MASTERY_CUTOFFS.proficient;
  const aggregateScored = hasTeamAverage(aggregate);
  let hiddenLowSampleCount = 0;
  const rows: ItemAnalysisQuestion[] = [];
  aggregate.perQuestion.forEach((question, index) => {
    if (
      question.servedCount !== undefined &&
      question.servedCount < MIN_SERVED_FOR_QUESTION
    ) {
      hiddenLowSampleCount++;
      return;
    }
    const pending = !aggregateScored || isQuestionPending(question);
    const dominantWrong = dominantWrongAnswer(question);
    rows.push({
      questionId: question.questionId,
      text: question.text,
      number: index + 1,
      scoring: question.scoring ?? 'binary',
      status: pending ? 'pending' : 'scored',
      correctPercent: pending ? null : clampPercent(question.correctPercent),
      answered: question.answered ?? 0,
      ...(dominantWrong ? { dominantWrong } : {}),
      reteach: false,
    });
  });
  rows.sort(compareItems);
  let reteachCount = 0;
  for (const row of rows) {
    if (reteachCount >= limit) break;
    if (row.correctPercent === null || row.correctPercent >= below) break;
    row.reteach = true;
    reteachCount++;
  }
  return {
    headline: {
      teamAveragePercent: aggregateScored
        ? clampPercent(aggregate.teamAveragePercent)
        : null,
      participation: buildParticipationSummary(aggregate),
      contributorCount: contributorCount(aggregate),
    },
    questions: rows,
    reteachCount,
    hiddenLowSampleCount,
  };
}

// Score distribution

export interface ScoreHistogramBand {
  min: number;
  /** Inclusive upper bound; the top band is open-ended (bonus scores over 100). */
  max: number;
  label: string;
  count: number;
  /** count / total, 0-1. */
  share: number;
  /** Rounded share, 0-100. */
  percent: number;
}

export interface ScoreDistribution {
  /** `empty`: nothing scored yet; `pending`: scored but the aggregate predates bands. */
  status: 'ready' | 'pending' | 'empty';
  /** Low to high, so a histogram reads left to right. */
  bands: ScoreHistogramBand[];
  total: number;
  /** Largest share across bands, for scaling the y axis. */
  maxShare: number;
}

export function buildScoreDistribution(
  aggregate: PlcAssessmentAggregate
): ScoreDistribution {
  const raw = aggregate.scoreDistribution;
  const status: ScoreDistribution['status'] = !hasTeamAverage(aggregate)
    ? 'empty'
    : raw
      ? 'ready'
      : 'pending';
  const counts = new Map<number, number>();
  if (status === 'ready' && raw) {
    for (const band of raw) {
      counts.set(band.min, (counts.get(band.min) ?? 0) + band.count);
    }
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const bands = [...SCORE_DISTRIBUTION_BANDS]
    .sort((a, b) => a.min - b.min)
    .map((band) => {
      const count = counts.get(band.min) ?? 0;
      const share = total > 0 ? count / total : 0;
      return {
        min: band.min,
        max: band.max === Infinity ? 100 : band.max,
        label: band.label,
        count,
        share,
        percent: Math.round(share * 100),
      };
    });
  return {
    status,
    bands,
    total,
    maxShare: bands.reduce((max, b) => Math.max(max, b.share), 0),
  };
}

// Dating aggregates

export interface DatedAggregate {
  aggregate: PlcAssessmentAggregate;
  assessment: PlcCommonAssessment | null;
  date: number;
  /** `ranAt` only when the assessment record is missing; it moves on every recompute. */
  dateSource: 'assessment' | 'ranAt';
}

/** Joins aggregates to their assessment for a date, oldest first; drops trashed and undatable ones. */
export function dateAggregates(
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[]
): DatedAggregate[] {
  const byId = new Map(assessments.map((a) => [a.id, a]));
  const dated: DatedAggregate[] = [];
  for (const aggregate of aggregates) {
    const assessment = byId.get(aggregate.assessmentId);
    if (assessment) {
      if (assessment.deletedAt != null) continue;
      dated.push({
        aggregate,
        assessment,
        date: assessmentRunDate(assessment),
        dateSource: 'assessment',
      });
    } else if (aggregate.ranAt > 0) {
      dated.push({
        aggregate,
        assessment: null,
        date: aggregate.ranAt,
        dateSource: 'ranAt',
      });
    }
  }
  return dated.sort(
    (a, b) =>
      a.date - b.date ||
      a.aggregate.assessmentId.localeCompare(b.aggregate.assessmentId)
  );
}

function titleOf(entry: DatedAggregate): string {
  return firstNonEmpty([entry.assessment?.title, entry.aggregate.title]) ?? '';
}

// Team trend

export interface TeamTrendPoint {
  assessmentId: string;
  title: string;
  date: number;
  dateSource: DatedAggregate['dateSource'];
  teamAveragePercent: number;
  scoredStudents: number | null;
  /** Points versus the previous plotted assessment; null on the first. */
  change: number | null;
}

/** Team average across common assessments, oldest first, skipping ones nobody has scored. */
export function buildTeamTrend(
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[]
): TeamTrendPoint[] {
  const points: TeamTrendPoint[] = [];
  for (const entry of dateAggregates(aggregates, assessments)) {
    if (!hasTeamAverage(entry.aggregate)) continue;
    const avg = clampPercent(entry.aggregate.teamAveragePercent);
    const prev = points[points.length - 1];
    points.push({
      assessmentId: entry.aggregate.assessmentId,
      title: titleOf(entry),
      date: entry.date,
      dateSource: entry.dateSource,
      teamAveragePercent: avg,
      scoredStudents:
        typeof entry.aggregate.scoredStudentCount === 'number'
          ? entry.aggregate.scoredStudentCount
          : null,
      change: prev ? avg - prev.teamAveragePercent : null,
    });
  }
  return points;
}

// Participation

export interface ParticipationRow {
  assessmentId: string;
  title: string;
  date: number;
  /** Counts only: how many teachers ran it, never which. */
  teachersRan: number;
  teachersExpected: number;
  students: ParticipationSummary;
}

export interface Participation {
  /** Newest first. */
  rows: ParticipationRow[];
  /** Assessments at least one teacher has run. */
  assessmentsRun: number;
  totalScoredStudents: number;
}

export interface BuildParticipationInput {
  aggregates: readonly PlcAssessmentAggregate[];
  assessments: readonly PlcCommonAssessment[];
  /** Uids of members who teach (viewers excluded by the caller). */
  teacherUids: readonly string[];
  /** Only assessments dated on or after this ms timestamp. */
  since?: number;
}

/** Per common assessment: how many teachers ran it and how many students were scored. */
export function buildParticipation(
  input: BuildParticipationInput
): Participation {
  const byId = new Map(input.aggregates.map((a) => [a.assessmentId, a]));
  const since = input.since ?? Number.NEGATIVE_INFINITY;
  const rows: ParticipationRow[] = [];
  for (const assessment of input.assessments) {
    if (assessment.deletedAt != null) continue;
    const date = assessmentRunDate(assessment);
    if (date < since) continue;
    const aggregate = byId.get(assessment.id);
    rows.push({
      assessmentId: assessment.id,
      title: assessment.title,
      date,
      teachersRan: aggregate?.contributorUids.length ?? 0,
      teachersExpected: teacherPoolSize(input.teacherUids, aggregate),
      students: aggregate
        ? buildParticipationSummary(aggregate)
        : { scoredStudents: 0, totalStudents: 0, percent: null },
    });
  }
  rows.sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
  return {
    rows,
    assessmentsRun: rows.filter((r) => r.teachersRan > 0).length,
    totalScoredStudents: rows.reduce(
      (sum, r) => sum + (r.students.scoredStudents ?? 0),
      0
    ),
  };
}

// Mastery by learning target / standard

export interface MasteryPoint {
  assessmentId: string;
  date: number;
  correctPercent: number;
  attempted: number;
  lowSample: boolean;
}

export interface MasteryRow {
  targetId: string;
  kind: LearningTargetKind;
  code?: string;
  label: string;
  /** Attempt-weighted across assessments; null when nothing is graded yet. */
  correctPercent: number | null;
  attempted: number;
  lowSample: boolean;
  /** Null while low-sample or ungraded. */
  band: MasteryBand | null;
  /** True when the PLC has since archived the target. */
  archived: boolean;
  /** Oldest first, for a per-target trend. */
  points: MasteryPoint[];
}

export type MasteryByTarget =
  | { tagged: false }
  | {
      tagged: true;
      targets: MasteryRow[];
      standards: MasteryRow[];
      cutoffs: MasteryCutoffs;
    };

export interface MasteryByTargetOptions {
  /** For dating and dropping trashed assessments; without it aggregates date by `ranAt`. */
  assessments?: readonly PlcCommonAssessment[];
  cutoffs?: MasteryCutoffs;
}

function compareMastery(a: MasteryRow, b: MasteryRow): number {
  const aUnknown = a.band === null;
  const bUnknown = b.band === null;
  if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
  return (
    (a.correctPercent ?? 0) - (b.correctPercent ?? 0) ||
    (a.code ?? a.label).localeCompare(b.code ?? b.label)
  );
}

function rollupMastery(
  dated: readonly DatedAggregate[],
  pick: (a: PlcAssessmentAggregate) => PlcAggregateTargetRow[] | undefined,
  targetsById: ReadonlyMap<string, LearningTarget>,
  cutoffs: MasteryCutoffs
): MasteryRow[] {
  const history = new Map<
    string,
    { latest: PlcAggregateTargetRow; points: MasteryPoint[] }
  >();
  for (const { aggregate, date } of dated) {
    for (const row of pick(aggregate) ?? []) {
      const entry = history.get(row.targetId) ?? {
        latest: row,
        points: [],
      };
      entry.latest = row;
      entry.points.push({
        assessmentId: aggregate.assessmentId,
        date,
        correctPercent: clampPercent(row.correctPercent),
        attempted: row.attempted,
        lowSample: row.lowSample,
      });
      history.set(row.targetId, entry);
    }
  }
  const rows: MasteryRow[] = [];
  for (const [targetId, { latest, points }] of history) {
    const attempted = points.reduce((sum, p) => sum + p.attempted, 0);
    const correctPercent =
      attempted > 0
        ? Math.round(
            points.reduce((sum, p) => sum + p.correctPercent * p.attempted, 0) /
              attempted
          )
        : null;
    const lowSample = attempted < MIN_ATTEMPTED_FOR_MASTERY;
    const current = targetsById.get(targetId);
    const code = current?.code ?? latest.code;
    rows.push({
      targetId,
      kind: latest.kind,
      ...(code ? { code } : {}),
      label: current?.label ?? latest.label,
      correctPercent,
      attempted,
      lowSample,
      band: lowSample ? null : masteryBandFor(correctPercent, cutoffs),
      archived: current?.archived === true,
      points,
    });
  }
  return rows.sort(compareMastery);
}

/** Mastery per target and per standard across assessments; `{ tagged: false }` when nothing is tagged. */
export function buildMasteryByTarget(
  aggregates: readonly PlcAssessmentAggregate[],
  targets: readonly LearningTarget[],
  options: MasteryByTargetOptions = {}
): MasteryByTarget {
  const dated = options.assessments
    ? dateAggregates(aggregates, options.assessments)
    : [...aggregates]
        .map((aggregate) => ({
          aggregate,
          assessment: null,
          date: aggregate.ranAt,
          dateSource: 'ranAt' as const,
        }))
        .sort(
          (a, b) =>
            a.date - b.date ||
            a.aggregate.assessmentId.localeCompare(b.aggregate.assessmentId)
        );
  const cutoffs = options.cutoffs ?? DEFAULT_MASTERY_CUTOFFS;
  const targetsById = new Map(targets.map((t) => [t.id, t]));
  // Standards appear in perStandard too, so perTarget keeps only PLC and personal targets.
  const targetRows = rollupMastery(
    dated,
    (a) => a.perTarget?.filter((row) => row.kind !== 'standard'),
    targetsById,
    cutoffs
  );
  const standardRows = rollupMastery(
    dated,
    (a) => a.perStandard,
    targetsById,
    cutoffs
  );
  if (targetRows.length === 0 && standardRows.length === 0) {
    return { tagged: false };
  }
  return {
    tagged: true,
    targets: targetRows,
    standards: standardRows,
    cutoffs,
  };
}
