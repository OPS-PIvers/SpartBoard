import type { QuestionBankMetadata, QuizBankSlot, QuizData } from '@/types';

/** Teammate bank a quiz slot may draw from (subset of `BankSource`). */
export interface SharedBankRef {
  syncGroupId?: string;
  plcId?: string;
}

export interface BankSlotShareReconciliation {
  /** Every slot, with `syncGroupId` stamped where the own bank is already shared. */
  bankSlots: QuizBankSlot[];
  /** True when at least one slot was stamped and the quiz needs re-saving. */
  changed: boolean;
  /** Titles of own banks that are not shared with the PLC (decision 24). */
  unsharedBankTitles: string[];
}

/**
 * Decision 24: a quiz can only be shared with a PLC when every random slot's
 * bank is shared with that same PLC. Own banks are checked by metadata;
 * teammate banks by the shared-source list.
 */
export function reconcileBankSlotsForPlcShare(
  quiz: Pick<QuizData, 'bankSlots'>,
  ownBanks: readonly QuestionBankMetadata[],
  plcId: string,
  sharedSources: readonly SharedBankRef[] = []
): BankSlotShareReconciliation {
  const unsharedBankTitles: string[] = [];
  let changed = false;
  const bankSlots = (quiz.bankSlots ?? []).map((slot) => {
    if (slot.mode !== 'random') return slot;
    const own = ownBanks.find((b) => b.id === slot.bankId);
    if (own) {
      const sync = own.sync;
      if (!sync || !sync.plcIds.includes(plcId)) {
        if (!unsharedBankTitles.includes(own.title))
          unsharedBankTitles.push(own.title);
        return slot;
      }
      if (slot.syncGroupId === sync.groupId) return slot;
      changed = true;
      return { ...slot, syncGroupId: sync.groupId };
    }
    const viaPlc = sharedSources.some(
      (s) =>
        !!slot.syncGroupId &&
        s.syncGroupId === slot.syncGroupId &&
        s.plcId === plcId
    );
    if (!viaPlc && !unsharedBankTitles.includes(slot.bankTitle))
      unsharedBankTitles.push(slot.bankTitle);
    return slot;
  });
  return { bankSlots, changed, unsharedBankTitles };
}

export function unsharedBanksMessage(titles: readonly string[]): string {
  const list = titles.map((t) => `"${t}"`).join(', ');
  return `Share the bank${titles.length === 1 ? '' : 's'} ${list} with this PLC first (Banks tab → Share with PLC).`;
}
