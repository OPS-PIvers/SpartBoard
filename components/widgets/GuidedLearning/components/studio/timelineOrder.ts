import type { GuidedLearningStep } from '@/types';

/** Where a new step on `slide` goes: after that slide's last step in play order. */
export function playOrderInsertIndex(
  steps: GuidedLearningStep[],
  slide: number
): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].imageIndex === slide) return i + 1;
  }
  // No step on this slide yet: after the last step on an earlier slide.
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].imageIndex < slide) return i + 1;
  }
  return 0;
}

/** Renumbers steps for a slide reorder; `order[i]` is the old index of the slide now at `i`. */
export function remapStepSlides(
  steps: GuidedLearningStep[],
  order: number[]
): GuidedLearningStep[] {
  const newIndexOf = new Map(order.map((oldIndex, i) => [oldIndex, i]));
  return steps.map((step) => {
    const next = newIndexOf.get(step.imageIndex);
    return next === undefined || next === step.imageIndex
      ? step
      : { ...step, imageIndex: next };
  });
}

/** Moves every step on `slide` to just before the first step on a later slide. */
export function stepsFollowSlide(
  steps: GuidedLearningStep[],
  slide: number
): GuidedLearningStep[] {
  const moving = steps.filter((s) => s.imageIndex === slide);
  if (moving.length === 0) return steps;
  const rest = steps.filter((s) => s.imageIndex !== slide);
  const at = rest.findIndex((s) => s.imageIndex > slide);
  const cut = at < 0 ? rest.length : at;
  const next = [...rest.slice(0, cut), ...moving, ...rest.slice(cut)];
  return next.every((s, i) => s === steps[i]) ? steps : next;
}

/** Steps in the order of `ids`; any step the list missed keeps its place at the end. */
export function stepsInIdOrder(
  steps: GuidedLearningStep[],
  ids: string[]
): GuidedLearningStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const ordered = ids.flatMap((id) => byId.get(id) ?? []);
  const seen = new Set(ordered.map((s) => s.id));
  const next = [...ordered, ...steps.filter((s) => !seen.has(s.id))];
  return next.every((s, i) => s === steps[i]) ? steps : next;
}
