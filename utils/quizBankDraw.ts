/**
 * Per-attempt bank-draw helpers shared by assign time (session
 * `totalQuestions`) and the student app (which draw to serve).
 */

import type { QuizSessionBankSlot } from '@/types';
import {
  drawServedQuestionIds,
  isValidDraw,
  type RandomIndex,
} from '@/utils/questionBanks';

/** Fixed (non-pool) count plus Σ slot.count — what one attempt serves. */
export function sessionTotalQuestions(
  questionIds: readonly string[],
  slots: readonly QuizSessionBankSlot[]
): number {
  const pooled = new Set(slots.flatMap((s) => s.poolQuestionIds));
  const fixed = questionIds.filter((id) => !pooled.has(id)).length;
  return fixed + slots.reduce((sum, s) => sum + s.count, 0);
}

export interface ChosenDraw {
  ids: string[];
  /** True when `ids` came from the persisted response rather than a fresh roll. */
  persisted: boolean;
}

/** Reuse a persisted draw when it is still legal for the session; otherwise roll once. */
export function chooseServedDraw(
  existing: readonly string[] | undefined,
  publicQuestionIds: readonly string[],
  slots: readonly QuizSessionBankSlot[],
  randomIndex?: RandomIndex
): ChosenDraw {
  if (
    existing &&
    existing.length > 0 &&
    isValidDraw(publicQuestionIds, slots, existing)
  ) {
    return { ids: [...existing], persisted: true };
  }
  return {
    ids: drawServedQuestionIds(publicQuestionIds, slots, randomIndex),
    persisted: false,
  };
}
