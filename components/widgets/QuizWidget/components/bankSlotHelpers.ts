import type {
  QuestionTargetTag,
  QuizBankSlot,
  QuizQuestion,
  QuizStimulus,
} from '@/types';
import type { BankSource } from '@/hooks/useBankSources';
import {
  bankSlotKey,
  effectiveQuestionTargets,
  type BankContent,
} from '@/utils/questionBanks';

/** The picker source a slot was built from, or undefined when it is gone. */
export const findSlotSource = (
  sources: readonly BankSource[] | undefined,
  slot: QuizBankSlot
): BankSource | undefined => {
  const key = bankSlotKey(slot);
  return sources?.find((s) => s.key === key);
};

/** Metadata-only eligible count: exact for an unfiltered slot, unknown otherwise. */
export const slotEligibleFromSource = (
  source: BankSource | undefined,
  slot: QuizBankSlot
): number | null => {
  if (!source) return null;
  if (slot.targetFilter && slot.targetFilter.length > 0) return null;
  return source.questionCount;
};

export interface BankTagCount {
  tag: QuestionTargetTag;
  count: number;
}

/** Every tag carried by a bank's questions (bank tags inherited), with eligible counts. */
export function bankTagCounts(
  bank: Pick<BankContent, 'questions' | 'targets'>
): BankTagCount[] {
  const byId = new Map<string, BankTagCount>();
  for (const q of bank.questions) {
    for (const tag of effectiveQuestionTargets(q, bank)) {
      const entry = byId.get(tag.id);
      if (entry) entry.count += 1;
      else byId.set(tag.id, { tag, count: 1 });
    }
  }
  return [...byId.values()].sort((a, b) =>
    (a.tag.code ?? a.tag.label).localeCompare(b.tag.code ?? b.tag.label)
  );
}

/** Stimuli referenced by at least one of the questions. */
export const referencedStimuli = (
  questions: readonly QuizQuestion[],
  stimuli: readonly QuizStimulus[]
): QuizStimulus[] => {
  const wanted = new Set(questions.flatMap((q) => q.stimulusIds ?? []));
  return stimuli.filter((s) => wanted.has(s.id));
};
