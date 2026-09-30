import type { QuizQuestion, QuizResponse } from '@/types';
import {
  buildResultsSheetData,
  formatQuizAnswerText,
} from './assignmentExportShared';
import { makeQuizGradeFn } from './quizDriveService';
import type { FibGradingContext } from './quizFibAnswers';
import { quoteCsvCell } from './quizTargetStats';

export interface QuizResultsCsvOptions {
  pinToName?: Record<string, string>;
  byStudentUid?: Map<string, { givenName: string; familyName: string }>;
  teacherName?: string;
  fibGrading?: FibGradingContext | null;
  timeAway?: boolean;
  /** Gradebook final score per student (D9); adds a Final score column when set. */
  finalScore?: (response: QuizResponse) => string;
}

/** The results sheet's columns for just these students, as CSV. */
export function buildQuizResultsCsv(
  responses: QuizResponse[],
  questions: QuizQuestion[],
  options: QuizResultsCsvOptions = {}
): string {
  const { headers, dataRows } = buildResultsSheetData<
    QuizQuestion,
    QuizResponse
  >(responses, questions, makeQuizGradeFn(options.fibGrading), {
    ...options,
    formatAnswer: formatQuizAnswerText,
  });
  const { finalScore } = options;
  const lines = finalScore
    ? [
        [...headers, 'Final score'],
        ...dataRows.map((row, i) => [...row, finalScore(responses[i])]),
      ]
    : [headers, ...dataRows];
  return lines
    .map((line) => line.map((cell) => quoteCsvCell(cell ?? '')).join(','))
    .join('\r\n');
}

/** Saves CSV text as a download, with a BOM so Excel reads UTF-8. */
export function downloadCsv(csv: string, baseName: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'quiz'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
