import type {
  QuizData,
  QuizQuestion,
  QuizSessionBankSlot,
  QuizStimulus,
} from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import { quizHasBankSlots, resolveQuizAssignment } from '@/utils/questionBanks';

export interface QuizAssignContent {
  questions: QuizQuestion[];
  stimuli?: QuizStimulus[];
  /** Drive file the assignment grades against (the frozen copy for bank draws). */
  driveFileId: string;
  /** Set only for bank-draw quizzes. */
  resolvedDriveFileId?: string;
  bankSlots?: QuizSessionBankSlot[];
}

/** Bank slots resolve to their pools and freeze into a Drive copy, as the Quiz widget's assign does. */
export async function resolveQuizAssignContent(
  data: QuizData,
  driveFileId: string,
  deps: {
    loadBankContentsForQuiz: (
      quiz: Pick<QuizData, 'bankSlots'>
    ) => Promise<Map<string, BankContent>>;
    saveDriveSnapshot: (quiz: QuizData) => Promise<string>;
  }
): Promise<QuizAssignContent> {
  if (!quizHasBankSlots(data)) {
    return {
      questions: Array.isArray(data.questions) ? data.questions : [],
      ...(data.stimuli ? { stimuli: data.stimuli } : {}),
      driveFileId,
    };
  }
  const resolved = resolveQuizAssignment(
    data,
    await deps.loadBankContentsForQuiz(data)
  );
  const resolvedDriveFileId = await deps.saveDriveSnapshot({
    ...data,
    questions: resolved.questions,
    stimuli: resolved.stimuli,
    bankSlots: undefined,
    order: undefined,
  });
  return {
    questions: resolved.questions,
    stimuli: resolved.stimuli,
    driveFileId: resolvedDriveFileId,
    resolvedDriveFileId,
    bankSlots: resolved.sessionSlots,
  };
}
