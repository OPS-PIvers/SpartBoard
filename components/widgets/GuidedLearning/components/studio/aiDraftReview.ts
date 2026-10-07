import type { GuidedLearningStep } from '@/types';

/** The step without its AI-draft marker. */
export function markReviewed(step: GuidedLearningStep): GuidedLearningStep {
  if (!step.aiDraft) return step;
  const { aiDraft: _aiDraft, ...rest } = step;
  return rest;
}

/** An edit to a drafted step's label or text counts as reviewing it. */
export function settleAiDraft(
  prev: GuidedLearningStep,
  next: GuidedLearningStep
): GuidedLearningStep {
  if (!next.aiDraft) return next;
  const edited =
    (prev.label ?? '') !== (next.label ?? '') ||
    (prev.text ?? '') !== (next.text ?? '');
  return edited ? markReviewed(next) : next;
}
