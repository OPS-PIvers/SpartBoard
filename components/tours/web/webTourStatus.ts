import { useEffect, useState } from 'react';
import type { GuidedLearningSet } from '@/types';
import { loadTourRuns } from '@/components/tours/tourRuns';
import { logError } from '@/utils/logError';
import {
  checkPasses,
  currentCheckResults,
  isConfirmedWeak,
} from './webStepReview';
import { hubStepsOf } from './webTourHub';
import {
  webFieldStatsOf,
  webStepState,
  type WebTourFieldStats,
} from './webTourHealth';
import { webToursDevSeed } from './webToursDevSeed';

export type StepProblem = 'not-found' | 'many' | 'unsure' | 'missed' | 'weak';

/** One web step's line in the status list, with its problem when it has one. */
export interface StepStatusRow {
  stepId: string;
  index: number;
  label: string;
  page: string;
  problem: StepProblem | null;
  /** For real-run problems: runs it struggled in, of all runs. */
  runs?: { hit: number; of: number };
}

export type TourStatus = 'passed' | 'issues' | 'unchecked';

/** Every web step with its worst problem from the last check and from real runs of the published version. */
export function stepStatusRows(
  set: GuidedLearningSet,
  field: WebTourFieldStats | null
): StepStatusRow[] {
  const results = currentCheckResults(set);
  return hubStepsOf(set.steps).map((step, index) => {
    const base = {
      stepId: step.id,
      index,
      label: step.label?.trim() ?? '',
      page: step.web.urlPattern,
    };
    const result = results?.[step.id];
    if (result === 'none') return { ...base, problem: 'not-found' };
    if (result === 'ambiguous') return { ...base, problem: 'many' };
    if (result === 'weak' && !isConfirmedWeak(set.webTourChecked, step))
      return { ...base, problem: 'unsure' };
    const state = webStepState(step.id, field);
    if (state === 'ok' || !field) return { ...base, problem: null };
    const weak = field.weak.get(step.id);
    const hit =
      state === 'missed'
        ? (field.misses.get(step.id) ?? 0)
        : weak
          ? weak.text + weak.css + weak.score
          : 0;
    return {
      ...base,
      problem: state === 'missed' ? 'missed' : 'weak',
      runs: { hit, of: field.runs },
    };
  });
}

export function tourStatus(
  set: GuidedLearningSet,
  rows: readonly StepStatusRow[]
): TourStatus {
  if (rows.some((r) => r.problem)) return 'issues';
  return checkPasses(set) ? 'passed' : 'unchecked';
}

/** Real-run stats of the published version, read once; null while loading or when unpublished. */
export function useWebTourField(
  setId: string,
  publishedAt: number | null
): WebTourFieldStats | null {
  const [state, setState] = useState<{
    key: string;
    field: WebTourFieldStats;
  } | null>(null);
  const key = publishedAt === null ? '' : `${setId}:${publishedAt}`;
  useEffect(() => {
    if (publishedAt === null) return;
    let cancelled = false;
    const seed = webToursDevSeed();
    const load = seed
      ? Promise.resolve(seed.runs[setId] ?? [])
      : loadTourRuns(setId);
    load.then(
      (runs) => {
        if (!cancelled)
          setState({
            key: `${setId}:${publishedAt}`,
            field: webFieldStatsOf(runs, publishedAt),
          });
      },
      (err: unknown) => logError('useWebTourField', err, { setId })
    );
    return () => {
      cancelled = true;
    };
  }, [setId, publishedAt]);
  return state && state.key === key ? state.field : null;
}
