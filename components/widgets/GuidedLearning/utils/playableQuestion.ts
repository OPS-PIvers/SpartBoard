import type { GuidedLearningPublicStep, GuidedLearningQuestion } from '@/types';
import { shuffleArray } from '@/utils/randomHelpers';

type PublicQuestion = NonNullable<GuidedLearningPublicStep['question']>;

/** A step's question as the player receives it: the student mirror, or the author's copy with its key. */
export type AnyStepQuestion = PublicQuestion &
  Pick<GuidedLearningQuestion, 'matchingPairs'>;

/** Shuffles, but never hands back `avoid` itself when it has two or more items. */
function shuffleAway(items: string[], avoid: string[]): string[] {
  const out = shuffleArray(items);
  const same =
    out.length > 1 &&
    out.length === avoid.length &&
    out.every((v, i) => v === avoid[i]);
  return same ? [...out.slice(1), out[0]] : out;
}

/** What the learner starts from, from either shape; sorting never opens solved. */
export function playableQuestion(
  q: AnyStepQuestion,
  correctSortingItems?: string[]
): PublicQuestion {
  if (q.type === 'matching' && !q.matchingLeft && q.matchingPairs) {
    return {
      ...q,
      matchingLeft: shuffleArray(q.matchingPairs.map((p) => p.left)),
      matchingRight: shuffleArray(q.matchingPairs.map((p) => p.right)),
    };
  }
  if (q.type === 'sorting' && q.sortingItems) {
    return {
      ...q,
      sortingItems: shuffleAway(
        q.sortingItems,
        correctSortingItems ?? q.sortingItems
      ),
    };
  }
  return q;
}
