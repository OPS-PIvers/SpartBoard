import type { GradebookKind } from '@/utils/gradebook/gradebookCore';

export type GradebookResultsKind = Extract<
  GradebookKind,
  'quiz' | 'video-activity' | 'guided-learning'
>;

/** Kinds whose existing Results view the gradebook can open. */
export function hasGradebookResultsView(
  kind: GradebookKind
): kind is GradebookResultsKind {
  return (
    kind === 'quiz' || kind === 'video-activity' || kind === 'guided-learning'
  );
}
