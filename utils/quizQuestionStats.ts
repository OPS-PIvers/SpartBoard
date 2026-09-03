import {
  isFreeResponseType,
  type GradeResult,
  type QuizQuestion,
  type QuizResponse,
} from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import { selectRepresentativeAnswers } from '@/utils/answerTakeOrdering';
import {
  applyMediaSlots,
  collectMediaSlots,
  readSlotGrade,
} from '@/utils/mediaGrading';

export interface QuestionStat {
  /** Students with a real (non-passed-over) answer. */
  answered: number;
  /** Auto-graded slots, and how many earned full credit. */
  autoTotal: number;
  correct: number;
  /** Manually graded slots (written primary, media primary, addendum), and how many carry a grade. */
  manualTotal: number;
  graded: number;
  /** Responses whose whole-question score is final (not awaiting a grade, not excused). */
  scoredCount: number;
  ratioSum: number;
  /** Mean of `pointsEarned / pointsMax` over scored responses, as a rounded percent. */
  averagePct: number | null;
}

export type QuestionGradeFn = (
  question: QuizQuestion,
  studentAnswer: string,
  response: QuizResponse
) => GradeResult;

/** Same fold the scoreboard uses: manual grade threaded through, media slots applied. */
export function gradeQuestionForResponse(
  question: QuizQuestion,
  studentAnswer: string,
  response: QuizResponse
): GradeResult {
  const manualGrade = isFreeResponseType(question.type)
    ? readSlotGrade(response.grading, question.id)
    : undefined;
  return applyMediaSlots(
    question,
    response,
    gradeAnswer(question, studentAnswer, manualGrade)
  );
}

function emptyStat(): QuestionStat {
  return {
    answered: 0,
    autoTotal: 0,
    correct: 0,
    manualTotal: 0,
    graded: 0,
    scoredCount: 0,
    ratioSum: 0,
    averagePct: null,
  };
}

/** Per-question counts plus the average earned ratio; ungraded and excused responses leave the mean. */
export function computeQuestionStats(
  questions: QuizQuestion[],
  responses: QuizResponse[],
  gradeFn: QuestionGradeFn = gradeQuestionForResponse
): Map<string, QuestionStat> {
  const stats = new Map<string, QuestionStat>();
  const questionsById = new Map<string, QuizQuestion>();
  for (const q of questions) {
    if (stats.has(q.id)) continue;
    stats.set(q.id, emptyStat());
    questionsById.set(q.id, q);
  }

  for (const r of responses) {
    // Takes put several answer entries on one question; count the student once.
    const representative = selectRepresentativeAnswers(r.answers ?? []);
    representative.forEach((entry, questionId) => {
      const qStats = stats.get(questionId);
      const q = questionsById.get(questionId);
      if (!qStats || !q) return;
      // A passed-over slot is not an answer.
      if (entry.unresponded) return;
      qStats.answered++;

      const slots = q.recording ? collectMediaSlots(q, r) : [];
      const mediaPrimary = slots.some(
        (s) =>
          s.slot === 'primary' && (s.takes.length > 0 || s.captureUnavailable)
      );
      const manualPrimary = isFreeResponseType(q.type) || mediaPrimary;

      const grade = gradeFn(q, entry.answer, r);

      if (manualPrimary) {
        qStats.manualTotal++;
        if (readSlotGrade(r.grading, q.id)) qStats.graded++;
      } else {
        qStats.autoTotal++;
        if (grade.isCorrect) qStats.correct++;
      }
      if (slots.some((s) => s.slot === 'addendum')) {
        qStats.manualTotal++;
        if (readSlotGrade(r.grading, q.id, 'addendum')) qStats.graded++;
      }

      // `not-attempted` is a genuine 0; `awaiting-grade` is a placeholder and stays out.
      if (grade.excused || grade.state === 'awaiting-grade') return;
      if (grade.pointsMax <= 0) return;
      qStats.scoredCount++;
      qStats.ratioSum += grade.pointsEarned / grade.pointsMax;
    });
  }

  for (const s of stats.values()) {
    s.averagePct =
      s.scoredCount > 0 ? Math.round((s.ratioSum / s.scoredCount) * 100) : null;
  }
  return stats;
}
