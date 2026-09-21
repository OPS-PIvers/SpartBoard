/**
 * Rubric strand tags on a written-answer annotation — the pure part, kept
 * out of the component file so the chips stay fast-refreshable.
 *
 * A tag is an evidence link only: it marks a passage (or an audio timestamp)
 * as evidence for a rubric strand and never scores anything.
 */

import type { Rubric, WrittenAnswerAnnotation } from '@/types';

export type RubricStrandTag = NonNullable<
  WrittenAnswerAnnotation['rubricCriteria']
>[number];

/**
 * Toggle one strand on an annotation's tag list, kept in rubric order so
 * saved payloads stay stable. Returns `undefined` when the list empties —
 * the field is omitted rather than written as `[]`.
 */
export function toggleStrandTag(
  current: RubricStrandTag[] | undefined,
  criterionId: string,
  rubric: Rubric
): RubricStrandTag[] | undefined {
  const existing = current ?? [];
  const isOn = existing.some((t) => t.criterionId === criterionId);
  if (isOn) {
    const next = existing.filter((t) => t.criterionId !== criterionId);
    return next.length > 0 ? next : undefined;
  }
  const criterion = rubric.criteria.find((c) => c.id === criterionId);
  if (!criterion) return current;
  const rubricOrder = new Map(rubric.criteria.map((c, i) => [c.id, i]));
  // Rubric order first; a strand no longer in the rubric sorts to the end.
  return [...existing, { criterionId, name: criterion.name }].sort((a, b) => {
    const ai = rubricOrder.get(a.criterionId) ?? Number.MAX_SAFE_INTEGER;
    const bi = rubricOrder.get(b.criterionId) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

/** Live name when the strand is still in the rubric, else the snapshot. */
export function strandLabel(
  tag: RubricStrandTag,
  rubric: Rubric | undefined
): string {
  return (
    rubric?.criteria.find((c) => c.id === tag.criterionId)?.name ?? tag.name
  );
}

/** Tags whose criterion has left the effective rubric. */
export function orphanedStrandTags(
  tags: RubricStrandTag[] | undefined,
  rubric: Rubric
): RubricStrandTag[] {
  const known = new Set(rubric.criteria.map((c) => c.id));
  return (tags ?? []).filter((t) => !known.has(t.criterionId));
}
