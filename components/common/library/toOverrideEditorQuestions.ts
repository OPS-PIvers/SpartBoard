/**
 * Projects loaded quiz questions into the shape `OverrideEditorRow`'s B2
 * question subset / MC-option hider needs (spec §5 B2). `options` is present
 * only for MC — Matching/Ordering/FIB/written types have no per-option hider,
 * they're still selectable in the subset picker via the bare question label.
 * Returns `[]` while the quiz's full content hasn't loaded yet.
 *
 * Shared by every host that renders `AssignTargetingSection` with a
 * `quizContext` (the in-app QuizManager assign modal and both LMS pickers), so
 * the option-id format the B2 editor emits — and that
 * `translateHiddenOptionIdsToText` later resolves — can't drift between them.
 */

import { isFreeResponseType, type QuizQuestion } from '@/types';
import type { OverrideEditorQuestion } from './OverrideEditorRow';

export function toOverrideEditorQuestions(
  data: { questions: QuizQuestion[] } | null | undefined
): OverrideEditorQuestion[] {
  if (!data || !Array.isArray(data.questions)) return [];
  return data.questions.map((q, index) => ({
    id: q.id,
    label: q.text || `Question ${index + 1}`,
    options:
      q.type === 'MC'
        ? [
            { id: `${q.id}-correct`, text: q.correctAnswer, isCorrect: true },
            ...q.incorrectAnswers.map((text, i) => ({
              id: `${q.id}-incorrect-${i}`,
              text,
              isCorrect: false,
            })),
          ]
        : undefined,
    // F2 fix — only short/essay are rubric-swappable; FIB/Matching/Ordering
    // are neither MC-hideable nor rubric-swappable, just subset-selectable.
    isWritten: isFreeResponseType(q.type),
  }));
}
