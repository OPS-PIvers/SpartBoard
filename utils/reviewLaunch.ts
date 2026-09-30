import type {
  QuizData,
  QuizOrderEntry,
  QuizQuestion,
  QuizSession,
  QuizSessionBankSlot,
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

/** Game lengths offered at launch, in minutes (plan D22). */
export const GAME_MINUTE_CHOICES = [3, 5, 10, 15, 20] as const;
export const DEFAULT_GAME_MINUTES = 10;
export const MAX_GAME_MINUTES = 90;

/** A game length the launch dialog accepts: whole minutes from 1 to 90. */
export function clampGameMinutes(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value))
    return DEFAULT_GAME_MINUTES;
  return Math.min(MAX_GAME_MINUTES, Math.max(1, Math.round(value)));
}

export interface PreparedReviewGame {
  questions: QuizQuestion[];
  stimuli?: QuizStimulus[];
  /** Per-student bank draws (D17), with unscorable pool questions removed. */
  bankSlots?: QuizSessionBankSlot[];
  skippedCount: number;
}

/**
 * Freeze a quiz for a self-paced game: banks resolve to pools each student
 * draws from (D17), choose-N sections keep their count (D18), and questions
 * that need a teacher grade are dropped (D19).
 */
export function prepareReviewGame(
  quiz: QuizData,
  banks: ReadonlyMap<string, BankContent> | null
): PreparedReviewGame {
  const hasSlots = quizHasBankSlots(quiz);
  const resolved = hasSlots
    ? resolveQuizAssignment(quiz, banks ?? new Map())
    : null;
  const all = resolved ? resolved.questions : quiz.questions;
  const questions = all.filter((q) => !questionNeedsManualGrading(q));
  const playable = new Set(questions.map((q) => q.id));
  if (!resolved) {
    return {
      questions,
      ...(quiz.stimuli ? { stimuli: quiz.stimuli } : {}),
      skippedCount: all.length - questions.length,
    };
  }
  const poolIds = new Set(
    resolved.sessionSlots.flatMap((slot) => slot.poolQuestionIds)
  );
  const bankSlots = resolved.sessionSlots.flatMap((slot) => {
    const pool = slot.poolQuestionIds.filter((id) => playable.has(id));
    if (pool.length === 0) return [];
    const firstIndex = questions.findIndex((q) => pool.includes(q.id));
    const position = questions
      .slice(0, firstIndex)
      .filter((q) => !poolIds.has(q.id)).length;
    return [
      {
        ...slot,
        poolQuestionIds: pool,
        count: Math.min(slot.count, pool.length),
        position,
      },
    ];
  });
  const fixedSkipped = quiz.questions.filter(
    (q) => !poolIds.has(q.id) && questionNeedsManualGrading(q)
  ).length;
  return {
    questions,
    stimuli: resolved.stimuli,
    ...(bankSlots.length > 0 ? { bankSlots } : {}),
    skippedCount: fixedSkipped,
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
