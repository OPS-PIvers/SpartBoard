import {
  isFreeResponseType,
  type QuizQuestion,
  type QuizResponse,
} from '@/types';
import { selectRepresentativeAnswers } from '@/utils/answerTakeOrdering';
import { formatQuizAnswerText } from '@/utils/assignmentExportShared';
import { isQuestionExcused } from '@/utils/mediaGrading';
import {
  gradeQuestionForResponse,
  type QuestionGradeFn,
} from '@/utils/quizQuestionStats';
import type { StudentOutcome } from '@/utils/quizQuestionDrilldown';
import { htmlToPlainText } from '@/utils/writtenAnnotations';

/** One question as one student saw it, graded live. */
export interface StudentQuestionLine {
  questionId: string;
  /** 1-based position in the quiz, matching the Questions screen. */
  number: number;
  text: string;
  type: QuizQuestion['type'];
  mark: StudentOutcome;
  pointsEarned: number;
  /** 0 when excused: the question leaves this student's denominator. */
  pointsMax: number;
  answerText: string;
  /** Answer key text under a wrong or partial auto-graded answer; null otherwise. */
  correctAnswerText: string | null;
  /** Written or recorded: graded by the teacher in the grader. */
  manual: boolean;
}

export interface StudentDrilldown {
  lines: StudentQuestionLine[];
  pointsEarned: number;
  pointsMax: number;
  /** Rounded percent over the questions that count; null when none do. */
  percent: number | null;
  /** At least one answer still needs a teacher grade. */
  provisional: boolean;
}

function isServed(response: QuizResponse, questionId: string): boolean {
  const served = response.servedQuestionIds;
  return !served || served.length === 0 || served.includes(questionId);
}

function readableAnswer(
  question: QuizQuestion,
  entry: Parameters<typeof formatQuizAnswerText>[1]
): string {
  const text = formatQuizAnswerText(question, entry);
  return isFreeResponseType(question.type) && /<[a-z][\s\S]*>/i.test(text)
    ? htmlToPlainText(text).trim()
    : text;
}

/** Question-by-question results for one student; bank quizzes list only the questions served. */
export function computeStudentDrilldown(
  questions: QuizQuestion[],
  response: QuizResponse,
  gradeFn: QuestionGradeFn = gradeQuestionForResponse
): StudentDrilldown {
  const answers = selectRepresentativeAnswers(response.answers ?? []);
  const seen = new Set<string>();
  const lines: StudentQuestionLine[] = [];

  questions.forEach((q, index) => {
    if (seen.has(q.id)) return;
    seen.add(q.id);
    if (!isServed(response, q.id)) return;
    const entry = answers.get(q.id);
    const max = q.points ?? 1;
    const manual = isFreeResponseType(q.type);
    const base = {
      questionId: q.id,
      number: index + 1,
      text: q.text,
      type: q.type,
      manual,
    };

    if (isQuestionExcused(q, response)) {
      lines.push({
        ...base,
        mark: 'excused',
        pointsEarned: 0,
        pointsMax: 0,
        answerText: entry ? readableAnswer(q, entry) : '',
        correctAnswerText: null,
      });
      return;
    }
    if (!entry || entry.unresponded) {
      lines.push({
        ...base,
        mark: 'noAnswer',
        pointsEarned: 0,
        pointsMax: max,
        answerText: '',
        correctAnswerText: null,
      });
      return;
    }

    const grade = gradeFn(q, entry.answer, response);
    let mark: StudentOutcome;
    if (grade.excused) mark = 'excused';
    else if (grade.state === 'not-attempted') mark = 'noAnswer';
    else if (grade.state === 'awaiting-grade') mark = 'ungraded';
    else if (grade.isCorrect) mark = 'correct';
    else if (grade.pointsEarned > 0) mark = 'partial';
    else mark = 'incorrect';

    const showKey =
      !manual &&
      (mark === 'incorrect' || mark === 'partial') &&
      q.correctAnswer.trim() !== '';
    lines.push({
      ...base,
      mark,
      pointsEarned: mark === 'excused' ? 0 : grade.pointsEarned,
      pointsMax: mark === 'excused' ? 0 : grade.pointsMax,
      answerText: readableAnswer(q, entry),
      correctAnswerText: showKey
        ? formatQuizAnswerText(q, { answer: q.correctAnswer })
        : null,
    });
  });

  let pointsEarned = 0;
  let pointsMax = 0;
  for (const line of lines) {
    pointsEarned += line.pointsEarned;
    pointsMax += line.pointsMax;
  }
  return {
    lines,
    pointsEarned,
    pointsMax,
    percent:
      pointsMax > 0 ? Math.round((pointsEarned / pointsMax) * 100) : null,
    provisional: lines.some((l) => l.mark === 'ungraded'),
  };
}
