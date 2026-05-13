/**
 * Shared results-sheet export primitives.
 *
 * Originally lived as `private buildResultsSheetData` on `QuizDriveService`.
 * PR3b lifts it here so Video Activity (and any future Quiz-style widget)
 * can produce the same column shape without duplicating the loop. The
 * grader is injected as a callback so each widget passes its own —
 * Quiz uses `gradeAnswer`, VA uses `gradeVideoActivityAnswer` (which
 * handles MA/FIB-variants that the Quiz grader has no case for).
 *
 * The shape is intentionally minimal: just the fields the column layout
 * reads. Quiz passes its `QuizResponse` / `QuizQuestion` directly (they
 * fit). VA wraps its `VideoActivityResponse` to map `completedAt` →
 * `submittedAt` + derive a `status` string.
 */

import type { GradeResult } from '@/types';
import { resolvePinName } from '@/components/widgets/QuizWidget/utils/quizScoreboard';

/**
 * Format a points value for export. Whole numbers stay as integers;
 * fractional partial-credit values render with up to 2 decimals.
 */
export function formatExportPoints(points: number): string {
  if (Number.isInteger(points)) return String(points);
  return (Math.round(points * 100) / 100).toString();
}

/** Minimum response shape the export reads. */
export interface ExportableResponse {
  pin?: string;
  studentUid: string;
  classPeriod?: string;
  answers: { questionId: string; answer: string }[];
  /** 'completed' | 'in-progress' | other widget-specific status string. */
  status: string;
  /**
   * When the response was finalized. VA's `completedAt` and Quiz's
   * `submittedAt` both fit; the export displays it verbatim.
   */
  submittedAt: number | null;
  tabSwitchWarnings?: number;
}

/** Minimum question shape the export reads. */
export interface ExportableQuestion {
  id: string;
  text: string;
  points?: number;
}

export interface BuildResultsSheetDataOptions {
  /** PIN → roster student name lookup. Per-period when keyed. */
  pinToName?: Record<string, string>;
  /** SSO uid → resolved ClassLink name. Wins over `pinToName` when present. */
  byStudentUid?: Map<string, { givenName: string; familyName: string }>;
  /** Teacher display name for the "Teacher" column. */
  teacherName?: string;
}

/**
 * Build headers + data rows for a results sheet export. Side-effect free.
 * The grader callback is widget-specific so MA/FIB-variant grading works
 * for VA, and Matching/Ordering partial credit works for Quiz.
 */
export function buildResultsSheetData<
  Q extends ExportableQuestion,
  R extends ExportableResponse,
>(
  responses: R[],
  questions: Q[],
  /**
   * Per-row grader. Receives the response as the optional third argument so
   * widget-specific graders that need per-response state (e.g. Quiz's manual
   * grades for `short`/`essay` questions, read from
   * `response.grading[questionId]`) can plumb it through. Auto-grading
   * widgets (or VA's grader) can ignore it.
   */
  gradeFn: (question: Q, studentAnswer: string, response?: R) => GradeResult,
  options?: BuildResultsSheetDataOptions
): { headers: string[]; dataRows: string[][] } {
  const pinToName = options?.pinToName ?? {};
  const byStudentUid = options?.byStudentUid;
  const teacherName =
    (options?.teacherName?.trim() ? options.teacherName.trim() : null) ??
    'Unknown Teacher';
  const timestamp = new Date().toISOString();

  const resolveStudent = (r: R): string => {
    const sso = byStudentUid?.get(r.studentUid);
    if (sso) {
      const full = `${sso.givenName ?? ''} ${sso.familyName ?? ''}`.trim();
      if (full) return full;
    }
    if (r.pin) {
      const name = resolvePinName(pinToName, r.classPeriod, r.pin);
      return name ?? `Student (PIN: ${r.pin})`;
    }
    return 'Student';
  };

  const maxPoints = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
  const headers = [
    'Timestamp',
    'Teacher',
    'Class Period',
    'Student',
    'PIN',
    'Status',
    'Score (%)',
    'Points Earned',
    'Max Points',
    'Warnings',
    'Submitted At',
    ...questions.map(
      (q, i) => `Q${i + 1} (${q.points ?? 1}pt): ${q.text.substring(0, 40)}`
    ),
  ];

  const dataRows = responses.map((r) => {
    const submitted = r.submittedAt
      ? new Date(r.submittedAt).toLocaleString()
      : '';
    const warnings = r.tabSwitchWarnings?.toString() ?? '0';
    const answerMap = new Map(r.answers.map((a) => [a.questionId, a]));
    // Grade once per question per response, cached by question id. The
    // previous shape called `gradeFn` twice (once for the answer column,
    // once for the row sum) which doubled normalization/regex work on
    // exports and is wasted effort even for cheap graders.
    const grades = new Map<string, ReturnType<typeof gradeFn>>();
    for (const q of questions) {
      const ans = answerMap.get(q.id);
      if (!ans) continue;
      grades.set(q.id, gradeFn(q, ans.answer, r));
    }
    const answerCols = questions.map((q) => {
      const grade = grades.get(q.id);
      if (!grade) return '';
      return formatExportPoints(grade.pointsEarned);
    });
    const earnedPoints = questions.reduce((sum, q) => {
      const grade = grades.get(q.id);
      return grade ? sum + grade.pointsEarned : sum;
    }, 0);
    const scoreDisplay =
      r.status === 'completed' && maxPoints > 0
        ? `${Math.round((earnedPoints / maxPoints) * 100)}%`
        : '';
    return [
      timestamp,
      teacherName,
      r.classPeriod ?? '',
      resolveStudent(r),
      r.pin ?? '',
      r.status,
      scoreDisplay,
      formatExportPoints(earnedPoints),
      String(maxPoints),
      warnings,
      submitted,
      ...answerCols,
    ];
  });

  // Stable sort by student name so the export reads naturally even when
  // responses arrive in arbitrary join order.
  dataRows.sort((a, b) => a[3].localeCompare(b[3]));
  return { headers, dataRows };
}
