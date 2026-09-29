import type {
  QuestionBankData,
  QuizBankSlot,
  QuizData,
  QuizOrderEntry,
  QuizSection,
} from '@/types';
import {
  bankSlotKey,
  randomBankSlots,
  type BankContent,
} from '@/utils/questionBanks';

/** A bank a shared quiz draws from, inlined so the importer needs no access to it. */
export interface SharedQuizBank extends BankContent {
  /** `bankSlotKey` of the slots that draw from it, at share time. */
  key: string;
}

/**
 * Quiz content a share link carries. Everything the editor needs to rebuild the
 * quiz: a quiz whose questions all come from bank draws has an empty
 * `questions` list, so the slots and their banks must travel too.
 */
export type SharedQuizContent = Pick<QuizData, 'title' | 'questions'> &
  Partial<
    Pick<
      QuizData,
      | 'stimuli'
      | 'paperSheetStimuli'
      | 'language'
      | 'bankSlots'
      | 'order'
      | 'sections'
    >
  > & { banks?: SharedQuizBank[] };

/** Loads the banks behind a quiz's random slots, keyed by `bankSlotKey`. */
export type LoadBankContentsForQuiz = (
  quiz: Pick<QuizData, 'bankSlots'>
) => Promise<ReadonlyMap<string, BankContent>>;

/**
 * Share payload for a quiz. Throws when a random slot's bank can't be loaded,
 * since the recipient would otherwise get slots that draw nothing.
 */
export async function buildSharedQuizContent(
  quiz: QuizData,
  loadBankContents?: LoadBankContentsForQuiz
): Promise<SharedQuizContent> {
  const slots = randomBankSlots(quiz);
  const banks: SharedQuizBank[] = [];
  if (slots.length > 0) {
    const contents = loadBankContents
      ? await loadBankContents(quiz)
      : new Map<string, BankContent>();
    const seen = new Set<string>();
    for (const slot of slots) {
      const key = bankSlotKey(slot);
      if (seen.has(key)) continue;
      seen.add(key);
      const bank = contents.get(key);
      if (!bank) {
        throw new Error(
          `"${slot.bankTitle}" could not be loaded, so this quiz can't be shared. Re-add that bank to the quiz and try again.`
        );
      }
      banks.push({
        key,
        id: bank.id,
        title: bank.title,
        questions: bank.questions,
        ...(bank.stimuli?.length ? { stimuli: bank.stimuli } : {}),
        ...(bank.targets?.length ? { targets: bank.targets } : {}),
      });
    }
  }
  return {
    title: quiz.title,
    questions: quiz.questions,
    ...(quiz.stimuli?.length ? { stimuli: quiz.stimuli } : {}),
    ...(quiz.paperSheetStimuli?.length
      ? { paperSheetStimuli: quiz.paperSheetStimuli }
      : {}),
    ...(quiz.language ? { language: quiz.language } : {}),
    ...(slots.length > 0 ? { bankSlots: slots, banks } : {}),
    ...(quiz.order?.length ? { order: quiz.order } : {}),
    ...(quiz.sections?.length ? { sections: quiz.sections } : {}),
  };
}

export interface RestoredSharedQuiz {
  /** Quiz fields for the importer's copy; slots point at the importer's new banks. */
  content: Omit<SharedQuizContent, 'banks'>;
  /** The importer's new banks, keyed by the new bank id (= the slot key now). */
  banks: Map<string, BankContent>;
}

/**
 * Rebuild shared content in the importer's library: each inlined bank is saved
 * as a new bank of theirs and the slots are pointed at it. Slots whose bank
 * was never inlined (links made before banks travelled) are kept so the
 * editor can flag them.
 */
export async function restoreSharedQuizContent(
  shared: SharedQuizContent,
  saveBank?: (bank: QuestionBankData) => Promise<unknown>,
  newId: () => string = () => crypto.randomUUID(),
  now: number = Date.now()
): Promise<RestoredSharedQuiz> {
  const { banks: sharedBanks, ...rest } = shared;
  const slots = randomBankSlots(shared);
  const banks = new Map<string, BankContent>();
  let bankSlots: QuizBankSlot[] | undefined;
  if (slots.length > 0) {
    const newIdByKey = new Map<string, string>();
    for (const bank of sharedBanks ?? []) {
      if (!saveBank || newIdByKey.has(bank.key)) continue;
      if (!slots.some((s) => bankSlotKey(s) === bank.key)) continue;
      const id = newId();
      const data: QuestionBankData = {
        id,
        title: bank.title,
        questions: bank.questions ?? [],
        ...(bank.stimuli?.length ? { stimuli: bank.stimuli } : {}),
        ...(bank.targets?.length ? { targets: bank.targets } : {}),
        createdAt: now,
        updatedAt: now,
      };
      await saveBank(data);
      newIdByKey.set(bank.key, id);
      banks.set(id, {
        id,
        title: data.title,
        questions: data.questions,
        ...(data.stimuli ? { stimuli: data.stimuli } : {}),
        ...(data.targets ? { targets: data.targets } : {}),
      });
    }
    bankSlots = slots.map((slot) => {
      const id = newIdByKey.get(bankSlotKey(slot));
      if (!id) return slot;
      const { syncGroupId: _syncGroupId, ...own } = slot;
      return { ...own, bankId: id };
    });
  }
  const order: QuizOrderEntry[] | undefined = rest.order?.length
    ? rest.order
    : undefined;
  const sections: QuizSection[] | undefined = rest.sections?.length
    ? rest.sections
    : undefined;
  return {
    content: {
      title: rest.title,
      questions: rest.questions ?? [],
      ...(rest.stimuli?.length ? { stimuli: rest.stimuli } : {}),
      ...(rest.paperSheetStimuli?.length
        ? { paperSheetStimuli: rest.paperSheetStimuli }
        : {}),
      ...(rest.language ? { language: rest.language } : {}),
      ...(bankSlots ? { bankSlots } : {}),
      ...(order ? { order } : {}),
      ...(sections ? { sections } : {}),
    },
    banks,
  };
}
