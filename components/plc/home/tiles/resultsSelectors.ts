// Results tile rollup: each target's latest mastery this school year, with a fallback chain.

import type {
  LearningTargetKind,
  PlcAssignmentIndexEntry,
  PlcAggregateTargetRow,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
} from '@/types';
import {
  weakestQuestions,
  type AssessmentWeakQuestion,
} from '@/components/plc/sharedData/sharedDataSelectors';
import { schoolYearStart } from '@/utils/plcHomeTime';

/** A change smaller than this many points draws no trend marker (D19). */
export const TREND_THRESHOLD_POINTS = 5;

export type TargetTrend = 'up' | 'down' | null;

export type ResultsRollupMode = 'targets' | 'standards' | 'questions' | 'empty';

export interface TargetMasteryRow {
  targetId: string;
  kind: LearningTargetKind;
  code?: string;
  label: string;
  correctPercent: number;
  lowSample: boolean;
  trend: TargetTrend;
  assessmentId: string;
}

export interface ResultsRollup {
  mode: ResultsRollupMode;
  /** Worst first; low-sample rows last (D12). */
  rows: TargetMasteryRow[];
  /** Question fallback: weakest questions on the latest assessment. */
  weakQuestions: AssessmentWeakQuestion[];
  latestAssessmentId: string | null;
}

/** The assessment's own date; `ranAt` moves on every recompute and is never used. */
export function assessmentRunDate(assessment: PlcCommonAssessment): number {
  return assessment.opensAt ?? assessment.dueAt ?? assessment.createdAt;
}

interface JoinedAggregate {
  aggregate: PlcAssessmentAggregate;
  date: number;
}

function joinByDate(
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[]
): JoinedAggregate[] {
  const byId = new Map<string, PlcCommonAssessment>();
  for (const a of assessments) {
    if (a.deletedAt == null) byId.set(a.id, a);
  }
  const joined: JoinedAggregate[] = [];
  for (const aggregate of aggregates) {
    const assessment = byId.get(aggregate.assessmentId);
    if (assessment) {
      joined.push({ aggregate, date: assessmentRunDate(assessment) });
    }
  }
  return joined.sort(
    (a, b) =>
      a.date - b.date ||
      a.aggregate.assessmentId.localeCompare(b.aggregate.assessmentId)
  );
}

function trendBetween(
  latest: PlcAggregateTargetRow,
  previous: PlcAggregateTargetRow | undefined
): TargetTrend {
  if (!previous || latest.lowSample || previous.lowSample) return null;
  const diff = latest.correctPercent - previous.correctPercent;
  if (Math.abs(diff) < TREND_THRESHOLD_POINTS) return null;
  return diff > 0 ? 'up' : 'down';
}

export function compareWorstFirst(
  a: TargetMasteryRow,
  b: TargetMasteryRow
): number {
  if (a.lowSample !== b.lowSample) return a.lowSample ? 1 : -1;
  return (
    a.correctPercent - b.correctPercent ||
    (a.code ?? a.label).localeCompare(b.code ?? b.label)
  );
}

function rollupDimension(
  joined: readonly JoinedAggregate[],
  pick: (agg: PlcAssessmentAggregate) => PlcAggregateTargetRow[] | undefined,
  yearStart: number
): TargetMasteryRow[] {
  const history = new Map<
    string,
    Array<{ row: PlcAggregateTargetRow; date: number; assessmentId: string }>
  >();
  for (const { aggregate, date } of joined) {
    for (const row of pick(aggregate) ?? []) {
      const list = history.get(row.targetId) ?? [];
      list.push({ row, date, assessmentId: aggregate.assessmentId });
      history.set(row.targetId, list);
    }
  }
  const rows: TargetMasteryRow[] = [];
  for (const list of history.values()) {
    const latest = list[list.length - 1];
    if (!latest || latest.date < yearStart) continue;
    const previous = list[list.length - 2];
    rows.push({
      targetId: latest.row.targetId,
      kind: latest.row.kind,
      ...(latest.row.code ? { code: latest.row.code } : {}),
      label: latest.row.label,
      correctPercent: latest.row.correctPercent,
      lowSample: latest.row.lowSample,
      trend: trendBetween(latest.row, previous?.row),
      assessmentId: latest.assessmentId,
    });
  }
  return rows.sort(compareWorstFirst);
}

/** D10-D12, D19: targets, else standards, else weakest questions on the latest assessment. */
export function latestTargetMastery(
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[],
  options: { now: number }
): ResultsRollup {
  const joined = joinByDate(aggregates, assessments);
  const latest = joined[joined.length - 1];
  const latestAssessmentId = latest?.aggregate.assessmentId ?? null;
  const yearStart = schoolYearStart(options.now);

  const targets = rollupDimension(joined, (a) => a.perTarget, yearStart);
  if (targets.length > 0) {
    return {
      mode: 'targets',
      rows: targets,
      weakQuestions: [],
      latestAssessmentId,
    };
  }
  const standards = rollupDimension(joined, (a) => a.perStandard, yearStart);
  if (standards.length > 0) {
    return {
      mode: 'standards',
      rows: standards,
      weakQuestions: [],
      latestAssessmentId,
    };
  }
  if (!latest) {
    return { mode: 'empty', rows: [], weakQuestions: [], latestAssessmentId };
  }
  return {
    mode: 'questions',
    rows: [],
    weakQuestions: weakestQuestions([...latest.aggregate.perQuestion], 3),
    latestAssessmentId,
  };
}

/** Legacy index entries without a status parse as active, so they count too. */
export function isLiveAssignment(entry: PlcAssignmentIndexEntry): boolean {
  return entry.status === 'active' || entry.status === 'paused';
}
