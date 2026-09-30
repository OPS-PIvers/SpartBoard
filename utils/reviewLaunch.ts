import type {
  QuizData,
  QuizOrderEntry,
  QuizQuestion,
  QuizSession,
  QuizStimulus,
  ReviewBoardRankLimit,
  ReviewLaunchSettings,
} from '@/types';
import {
  drawServedQuestionIds,
  quizHasBankSlots,
  quizOrder,
  resolveQuizAssignment,
  type BankContent,
  type RandomIndex,
} from '@/utils/questionBanks';
import { questionNeedsManualGrading } from '@/utils/quizScoreOnSubmit';
import { sectionOfQuestion } from '@/utils/quizSections';

/** First-launch Review settings (plan D15, D21). */
export const DEFAULT_REVIEW_LAUNCH_SETTINGS: ReviewLaunchSettings = {
  sessionMode: 'teacher',
  sessionOptions: {
    tabWarningsEnabled: true,
    blockCopyPaste: false,
    showResultToStudent: true,
    showCorrectAnswerToStudent: true,
    showCorrectOnBoard: true,
    shuffleAnswerOptions: true,
    speedBonusEnabled: true,
    streakBonusEnabled: true,
    showPodiumBetweenQuestions: true,
    soundEffectsEnabled: true,
    boardRankLimit: 5,
  },
};

export interface PreparedReviewQuiz {
  questions: QuizQuestion[];
  stimuli?: QuizStimulus[];
  order?: QuizOrderEntry[];
  sections?: QuizData['sections'];
  /** Served questions left out because they need a teacher grade (plan D19). */
  skippedCount: number;
}

/** Questions a Review game can't score; the Start dialog counts these (plan D19). */
export function countUnscoredQuestions(
  questions: readonly Pick<QuizQuestion, 'type' | 'recording'>[]
): number {
  return questions.filter(questionNeedsManualGrading).length;
}

/**
 * Freeze a quiz for a teacher-paced Review: one bank draw for the whole class
 * (D17), unscorable questions dropped (D19), and every section played in full (D18).
 */
export function prepareReviewQuiz(
  quiz: QuizData,
  banks: ReadonlyMap<string, BankContent> | null,
  randomIndex?: RandomIndex
): PreparedReviewQuiz {
  let questions = quiz.questions;
  let stimuli = quiz.stimuli;
  let order = quiz.order;
  if (quizHasBankSlots(quiz)) {
    const resolved = resolveQuizAssignment(quiz, banks ?? new Map());
    const drawn = drawServedQuestionIds(
      resolved.questions.map((q) => q.id),
      resolved.sessionSlots,
      randomIndex
    );
    const drawnSet = new Set(drawn);
    const slotDraws = new Map(
      resolved.sessionSlots.map((slot) => [
        slot.id,
        drawn.filter((id) => slot.poolQuestionIds.includes(id)),
      ])
    );
    order = quizOrder(quiz).flatMap((entry): QuizOrderEntry[] =>
      entry.kind === 'slot'
        ? (slotDraws.get(entry.id) ?? []).map((id) => ({
            kind: 'question',
            id,
          }))
        : [entry]
    );
    const byId = new Map(resolved.questions.map((q) => [q.id, q]));
    questions = order.flatMap((entry) => {
      const q = entry.kind === 'question' ? byId.get(entry.id) : undefined;
      return q && drawnSet.has(q.id) ? [q] : [];
    });
    stimuli = resolved.stimuli;
  }
  const playable = questions.filter((q) => !questionNeedsManualGrading(q));
  const playableIds = new Set(playable.map((q) => q.id));
  return {
    questions: playable,
    ...(stimuli ? { stimuli } : {}),
    ...(order
      ? {
          order: order.filter(
            (e) => e.kind !== 'question' || playableIds.has(e.id)
          ),
        }
      : {}),
    ...(quiz.sections?.length
      ? {
          sections: quiz.sections.map((section) => {
            const copy = { ...section };
            delete copy.chooseCount;
            return copy;
          }),
        }
      : {}),
    skippedCount: questions.length - playable.length,
  };
}

/** Rows the board leaderboard shows; legacy sessions keep their top 3. */
export function boardRankRows(limit: ReviewBoardRankLimit | undefined): number {
  if (limit === undefined) return 3;
  return limit === 'all' ? Number.POSITIVE_INFINITY : limit;
}

/** English ordinal for a rank: 1st, 2nd, 3rd, 11th, 22nd. */
export function rankOrdinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

/** The section a paced question opens, so the board can show its divider (D18). */
export function sectionStartingAt(
  session: Pick<QuizSession, 'sections'>,
  questionId: string | undefined
) {
  if (!questionId || !session.sections?.length) return undefined;
  const section = sectionOfQuestion(session.sections, questionId);
  return section?.questionIds[0] === questionId ? section : undefined;
}
