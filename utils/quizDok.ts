import type { QuestionTargetTag, QuizQuestion, QuizResponse } from '@/types';
import type { MasteryCutoffs } from '@/utils/learningTargets';
import type { FibGradingContext } from '@/utils/quizFibAnswers';
import { computeTargetStats, type QuizTargetStats } from './quizTargetStats';

export const DOK_LEVELS = [1, 2, 3, 4] as const;

/** A DOK level read as a target, so the target breakdown can group by it. */
export const dokTargetTag = (level: number): QuestionTargetTag => ({
  id: `dok:${level}`,
  kind: 'personal',
  label: `DOK ${level}`,
});

/** True when at least one question carries a DOK level. */
export const quizHasDok = (questions: readonly Pick<QuizQuestion, 'dok'>[]) =>
  questions.some((q) => q.dok != null);

/** The questions re-tagged by DOK level only; questions without a level are left untagged. */
export function questionsTaggedByDok(
  questions: QuizQuestion[]
): QuizQuestion[] {
  return questions.map((q) => {
    const { targets: _targets, ...rest } = q;
    void _targets;
    return q.dok != null ? { ...rest, targets: [dokTargetTag(q.dok)] } : rest;
  });
}

/** Mastery by DOK level, lowest level first; reuses the target maths so every number matches. */
export function computeDokStats(
  questions: QuizQuestion[],
  responses: QuizResponse[],
  cutoffs: MasteryCutoffs,
  fibGrading?: FibGradingContext | null
): QuizTargetStats {
  const stats = computeTargetStats(
    questionsTaggedByDok(questions),
    responses,
    cutoffs,
    fibGrading
  );
  return {
    ...stats,
    standards: [],
    targets: [...stats.targets].sort((a, b) =>
      a.target.id.localeCompare(b.target.id)
    ),
  };
}
