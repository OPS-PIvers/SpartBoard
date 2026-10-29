// Google Sheets export for Mini App results v2, through the Quiz exporter (docs/plans/MINI_APP_RESULTS.md D10).
import { QuizDriveService } from '@/utils/quizDriveService';
import type {
  MiniAppBestAttempt,
  MiniAppManifestQuestion,
  QuizQuestion,
  QuizResponse,
  StaffResponseFields,
} from '@/types';

const SCORE_ID = '__score';

export interface MiniAppExportRow extends StaffResponseFields {
  id: string;
  best: MiniAppBestAttempt | null;
  lastSubmittedAt: number;
}

/** Creates a results sheet and returns its URL; each question cell is the best attempt's mark. */
export function exportMiniAppResults(
  token: string,
  title: string,
  rows: MiniAppExportRow[],
  questions: MiniAppManifestQuestion[],
  names?: Map<string, { givenName: string; familyName: string }>
): Promise<string> {
  // An app with no question list gets one Score column out of 100.
  const scoreOnly = questions.length === 0;
  const answersFor = (best: MiniAppBestAttempt | null) => {
    if (!best) return [];
    if (scoreOnly)
      return [
        {
          questionId: SCORE_ID,
          answer: String(
            best.maxScore > 0 ? (best.score / best.maxScore) * 100 : 0
          ),
        },
      ];
    return (best.items ?? []).map((m) => ({
      questionId: m.id,
      answer: m.correct ? 'Correct' : 'Incorrect',
    }));
  };
  const responses = rows.map((r) => ({
    studentUid: r.id,
    ...(r.staffEmail
      ? { staffEmail: r.staffEmail, staffName: r.staffName ?? '' }
      : {}),
    pin: '',
    joinedAt: r.lastSubmittedAt,
    status: 'completed' as const,
    answers: answersFor(r.best),
    score: null,
    submittedAt: r.lastSubmittedAt,
  })) as unknown as QuizResponse[];
  const sheetQuestions = (scoreOnly
    ? [{ id: SCORE_ID, text: 'Score', points: 100 }]
    : questions.map((q) => ({
        id: q.id,
        text: q.prompt,
        points: q.points ?? 1,
      }))) as unknown as QuizQuestion[];
  return new QuizDriveService(token).exportResultsToSheet(
    title,
    responses,
    sheetQuestions,
    {
      byStudentUid: names,
      gradeFn: (q, answer) => {
        const max = q.points ?? 1;
        if (q.id === SCORE_ID) {
          const earned = Number(answer) || 0;
          return {
            isCorrect: earned >= max,
            pointsEarned: earned,
            pointsMax: max,
            state: 'scored',
          };
        }
        const correct = answer === 'Correct';
        return {
          isCorrect: correct,
          pointsEarned: correct ? max : 0,
          pointsMax: max,
          state: 'scored',
        };
      },
    }
  );
}
