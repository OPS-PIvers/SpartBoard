/** Balanced bank slots: deal pool questions in turn per class period (QUIZ_IMPORT_VERSIONS.md V18-V19). */

import type {
  QuizQuestion,
  QuizResponse,
  QuizSessionBankSlot,
} from '@/types';
import { drawServedQuestionIds, isValidDraw } from '@/utils/questionBanks';
import { encodeResponseKeySegment } from '@/utils/quizResponseKey';

/** Subcollection under `quiz_sessions/{id}` holding one `{ dealt }` counter per slot and period. */
export const BANK_DEALS_COLLECTION = 'bank_deals';

export function isBalancedSlot(slot: QuizSessionBankSlot): boolean {
  return (
    slot.dealing === 'balanced' &&
    slot.count > 0 &&
    slot.poolQuestionIds.length > 0
  );
}

export function hasBalancedSlots(
  slots: readonly QuizSessionBankSlot[] | undefined
): boolean {
  return !!slots && slots.some(isBalancedSlot);
}

/** One rotation per class period; a response with no period shares the `default` rotation. */
export function balancedPeriodKey(
  response: Pick<QuizResponse, 'classPeriod' | 'classId'>
): string {
  return encodeResponseKeySegment(response.classPeriod ?? response.classId);
}

export function bankDealDocId(slotId: string, periodKey: string): string {
  return `${slotId}__${periodKey}`;
}

/**
 * The `count` pool ids at rotation turn `dealt`, skipping ids this student
 * has already had; seen ids fill in only when too few unseen ones remain.
 */
export function dealFromRotation(
  pool: readonly string[],
  count: number,
  dealt: number,
  seen: ReadonlySet<string>
): string[] {
  const n = pool.length;
  if (n === 0 || count < 1) return [];
  const start = (((Math.max(0, dealt) * count) % n) + n) % n;
  const turn = Array.from({ length: n }, (_, i) => pool[(start + i) % n]);
  const unseen = turn.filter((id) => !seen.has(id));
  const fill = turn.filter((id) => seen.has(id));
  return [...unseen, ...fill].slice(0, Math.min(count, n));
}

export interface BalancedDealPlan {
  /** The attempt's full served list (fixed questions plus every slot). */
  ids: string[];
  /** Slots whose counter advances, with the new `dealt` value. */
  counters: { slotId: string; dealt: number }[];
  /** The response's `dealtQuestionIds` after this deal. */
  history: string[];
}

/**
 * Pure core of the deal transaction. Returns `null` when the response already
 * holds a valid draw (rejoin or a second device), so nothing is written.
 */
export function planBalancedDeal(
  publicQuestionIds: readonly string[],
  slots: readonly QuizSessionBankSlot[],
  response: Pick<QuizResponse, 'servedQuestionIds' | 'dealtQuestionIds'>,
  dealtCounts: ReadonlyMap<string, number>
): BalancedDealPlan | null {
  const existing = response.servedQuestionIds;
  if (
    existing &&
    existing.length > 0 &&
    isValidDraw(publicQuestionIds, slots, existing)
  ) {
    return null;
  }
  const history = [...(response.dealtQuestionIds ?? [])];
  const seen = new Set(history);
  const dealtBySlot = new Map<string, string[]>();
  const counters: BalancedDealPlan['counters'] = [];
  for (const slot of slots) {
    if (!isBalancedSlot(slot)) continue;
    const dealt = dealtCounts.get(slot.id) ?? 0;
    const ids = dealFromRotation(
      slot.poolQuestionIds,
      slot.count,
      dealt,
      seen
    );
    dealtBySlot.set(slot.id, ids);
    counters.push({ slotId: slot.id, dealt: dealt + 1 });
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        history.push(id);
      }
    }
  }
  const ids = drawServedQuestionIds(
    publicQuestionIds,
    slots,
    undefined,
    dealtBySlot
  );
  return { ids, counters, history };
}

/** "Version B" style label for each balanced slot a response was served; `sourceLabel` wins when set. */
export function servedVersionLabels(
  slots: readonly QuizSessionBankSlot[] | undefined,
  servedQuestionIds: readonly string[] | undefined,
  questions: readonly Pick<QuizQuestion, 'id' | 'sourceLabel'>[]
): string[] {
  if (!slots || !servedQuestionIds || servedQuestionIds.length === 0) return [];
  const served = new Set(servedQuestionIds);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const labels: string[] = [];
  for (const slot of slots) {
    if (!isBalancedSlot(slot)) continue;
    slot.poolQuestionIds.forEach((id, index) => {
      if (!served.has(id)) return;
      const own = byId.get(id)?.sourceLabel?.trim();
      labels.push(own ? own : `Version ${versionLetter(index)}`);
    });
  }
  return labels;
}

/** A, B, ... Z, AA, AB ... */
function versionLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
