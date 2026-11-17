// Writing's frozen copies in Quiz's shapes, so Writing grades in Quiz's own grader: step 1 is each student's latest copy, step 2 the one before, and so on.
import type {
  QuizData,
  QuizResponse,
  WritingAssignmentSession,
  WritingFeedback,
  WrittenAnswerGrade,
} from '@/types';
import type { WritingDraftWithId } from '@/hooks/useWritingResults';
import type {
  WritingFeedbackPayload,
  WritingResultRow,
} from '@/utils/writingGrading';
import { writingMaxPoints } from '@/utils/writingGrading';

const PREFIX = 'draft-back-';

/** Step id for the copy `back` places before the latest (0 is the latest). */
export const draftQuestionId = (back: number): string => `${PREFIX}${back}`;

export const draftBackOf = (questionId: string | undefined): number | null => {
  if (!questionId?.startsWith(PREFIX)) return null;
  const n = Number(questionId.slice(PREFIX.length));
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** A student's copies, latest first. */
export const newestFirst = (
  drafts: readonly WritingDraftWithId[]
): WritingDraftWithId[] => [...drafts].sort((a, b) => b.number - a.number);

/** The copy a step shows for one student. */
export const draftAtStep = (
  drafts: readonly WritingDraftWithId[] | undefined,
  questionId: string | undefined
): WritingDraftWithId | undefined => {
  const back = draftBackOf(questionId);
  return back === null ? undefined : newestFirst(drafts ?? [])[back];
};

/** One free-response step per copy depth any student has, each carrying the prompt and the score or rubric. */
export function writingGraderQuiz(
  session: Pick<
    WritingAssignmentSession,
    'id' | 'title' | 'prompt' | 'grading'
  >,
  draftsByStudent: ReadonlyMap<string, WritingDraftWithId[]>
): QuizData {
  let top = 0;
  for (const drafts of draftsByStudent.values())
    top = Math.max(top, drafts.length);
  const max = writingMaxPoints(session.grading);
  const rubric =
    session.grading.mode === 'rubric'
      ? session.grading.rubricSnapshot
      : undefined;
  return {
    id: session.id,
    title: session.title,
    questions: Array.from({ length: top }, (_, i) => ({
      id: draftQuestionId(i),
      timeLimit: 0,
      text: session.prompt,
      type: 'free-response' as const,
      correctAnswer: '',
      incorrectAnswers: [],
      points: max ?? 1,
      ...(rubric ? { rubricSnapshot: rubric } : {}),
    })),
    createdAt: 0,
    updatedAt: 0,
  };
}

const toGrade = (f: WritingFeedback): WrittenAnswerGrade => ({
  pointsAwarded: f.pointsAwarded ?? 0,
  ...(f.overallComment ? { overallComment: f.overallComment } : {}),
  ...(f.annotations?.length ? { annotations: f.annotations } : {}),
  ...(f.rubricScores?.length ? { rubricScores: f.rubricScores } : {}),
  ...(f.excused ? { excused: true } : {}),
  gradedBy: f.gradedBy,
  gradedAt: f.gradedAt,
});

/** Each student with a turned-in copy as a completed response: every copy an answer, its feedback the grade. */
export function writingGraderResponses(
  rows: readonly WritingResultRow[],
  draftsByStudent: ReadonlyMap<string, WritingDraftWithId[]>
): QuizResponse[] {
  return rows.flatMap((row) => {
    const drafts = draftsByStudent.get(row.studentUid) ?? [];
    if (drafts.length === 0) return [];
    const ordered = newestFirst(drafts);
    const grading: Record<string, WrittenAnswerGrade> = {};
    ordered.forEach((d, back) => {
      if (d.feedback) grading[draftQuestionId(back)] = toGrade(d.feedback);
    });
    return [
      {
        _responseKey: row.studentUid,
        studentUid: row.studentUid,
        pin: '',
        joinedAt: 0,
        status: 'completed' as const,
        answers: ordered.map((d, back) => ({
          questionId: draftQuestionId(back),
          answer: d.html,
          answeredAt: d.turnedInAt,
        })),
        grading,
        score: null,
        submittedAt: row.response?.turnedInAt ?? null,
        tabSwitchWarnings: 0,
      },
    ];
  });
}

/** The grader's grade as the callable's feedback; ungraded Writing sends comments and highlights only. */
export function writingFeedbackFromGrade(
  grade: WrittenAnswerGrade | null,
  ungraded: boolean
): WritingFeedbackPayload {
  if (!grade) return {};
  const comments = {
    ...(grade.overallComment ? { overallComment: grade.overallComment } : {}),
    ...(grade.annotations?.length ? { annotations: grade.annotations } : {}),
  };
  if (ungraded) return comments;
  if (grade.excused) return { ...comments, excused: true };
  return {
    ...comments,
    pointsAwarded: grade.pointsAwarded,
    ...(grade.rubricScores?.length ? { rubricScores: grade.rubricScores } : {}),
  };
}
