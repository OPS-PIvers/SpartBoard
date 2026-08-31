/** Per-student rubric override resolution for the grader (M17 spec §5 C4). */

import type { Rubric, StudentOverride } from '@/types';

export interface ResolvedQuestionRubric {
  /** Effective rubric to render/score with, or `undefined` if the question has none. */
  rubric: Rubric | undefined;
  /** True when a per-student override changed the effective rubric/mode. */
  isOverridden: boolean;
  /** `'rubric'` = alternate rubric swapped in; `'points'` = raw points, ignore any rubric. */
  overrideMode: 'rubric' | 'points' | null;
}

/**
 * Resolve the rubric a written response should be graded against, honoring
 * a per-student `rubricOverrideByQuestion` entry on the teacher's assignment
 * doc when one matches. Falls back to the question's base `rubricSnapshot`
 * whenever the response can't be matched to an override (no studentUid, no
 * pseudonym resolution yet, unmatched uid, or no override for this question)
 * — this is the "no overrides configured" and "unmatched uid" fallback path.
 */
export function resolveRubricForResponse(
  question: { id: string; rubricSnapshot?: Rubric },
  responseStudentUid: string | null | undefined,
  overridesBySourcedId: Record<string, StudentOverride> | null | undefined,
  targetRefKeyByStudentUid: Map<string, string> | null | undefined
): ResolvedQuestionRubric {
  const baseRubric = question.rubricSnapshot;
  const fallback: ResolvedQuestionRubric = {
    rubric: baseRubric,
    isOverridden: false,
    overrideMode: null,
  };
  if (
    !overridesBySourcedId ||
    !targetRefKeyByStudentUid ||
    !responseStudentUid
  ) {
    return fallback;
  }
  const targetRefKey = targetRefKeyByStudentUid.get(responseStudentUid);
  if (!targetRefKey) return fallback;
  const override = overridesBySourcedId[targetRefKey];
  const questionOverride = override?.rubricOverrideByQuestion?.[question.id];
  if (questionOverride === undefined) return fallback;
  if (questionOverride === 'points') {
    return { rubric: undefined, isOverridden: true, overrideMode: 'points' };
  }
  return {
    rubric: questionOverride,
    isOverridden: true,
    overrideMode: 'rubric',
  };
}
