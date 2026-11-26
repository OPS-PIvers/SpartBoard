// Google Sheets export for Writing results, through the shared Quiz exporter.
import { QuizDriveService } from '@/utils/quizDriveService';
import { sumRubricScorePoints } from '@/utils/rubricPoints';
import type {
  GradeResult,
  QuizQuestion,
  QuizResponse,
  WritingResponse,
} from '@/types';

/** The one sheet question that holds the piece's score. */
export const WRITING_PIECE_ID = 'piece';

/** The returned points, or null when there is no score yet. */
function returnedPoints(r: WritingResponse): number | null {
  const g = r.grade;
  if (!g || g.excused) return null;
  const points =
    g.pointsAwarded ??
    (g.rubricScores ? sumRubricScorePoints(g.rubricScores) : undefined);
  return typeof points === 'number' ? points : null;
}

/** Quiz-shaped rows: turned in or returned counts as completed; a piece with no returned score is Ungraded. */
export function writingSheetResponses(
  responses: WritingResponse[],
  graded: boolean
): QuizResponse[] {
  return responses.map((r) => {
    const completed = r.status === 'turned-in' || r.status === 'returned';
    const points = returnedPoints(r);
    const excused = r.grade?.excused === true;
    const hasPiece = completed || points !== null;
    return {
      studentUid: r.studentUid,
      pin: '',
      joinedAt: r.startedAt,
      status: completed ? 'completed' : 'in-progress',
      answers:
        graded && hasPiece && !excused
          ? [
              {
                questionId: WRITING_PIECE_ID,
                answer: points === null ? '' : String(points),
              },
            ]
          : [],
      ...(excused
        ? { grading: { [WRITING_PIECE_ID]: { excused: true } } }
        : {}),
      score: null,
      submittedAt: r.turnedInAt ?? null,
    } as unknown as QuizResponse;
  });
}

/** Points from the stored cell; an empty cell is a piece still to grade. */
export function writingSheetGrade(
  question: QuizQuestion,
  answer: string
): GradeResult {
  const max = question.points ?? 1;
  if (answer === '') {
    return {
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: max,
      state: 'awaiting-grade',
    };
  }
  const earned = Number(answer) || 0;
  return {
    isCorrect: earned >= max,
    pointsEarned: earned,
    pointsMax: max,
    state: 'scored',
  };
}

export interface WritingExportOptions {
  byStudentUid?: Map<string, { givenName: string; familyName: string }>;
  teacherName?: string;
}

/** Creates a results sheet for a Writing assignment and returns its URL; ungraded work has no score column. */
export function exportWritingResults(
  token: string,
  title: string,
  responses: WritingResponse[],
  maxPoints: number | null,
  options: WritingExportOptions = {}
): Promise<string> {
  const graded = maxPoints !== null;
  const words = new Map(
    responses.map((r) => [r.studentUid, r.summary?.wordCount ?? 0])
  );
  const questions = graded
    ? ([
        { id: WRITING_PIECE_ID, text: title, points: maxPoints },
      ] as QuizQuestion[])
    : [];
  return new QuizDriveService(token).exportResultsToSheet(
    title,
    writingSheetResponses(responses, graded),
    questions,
    {
      byStudentUid: options.byStudentUid,
      teacherName: options.teacherName,
      gradeFn: writingSheetGrade,
      extraColumn: {
        header: 'Words',
        cell: (r) => String(words.get(r.studentUid) ?? 0),
      },
    }
  );
}
