/**
 * Video Activity Drive Service.
 *
 * Wraps the shared `buildResultsSheetData` helper from
 * `assignmentExportShared.ts` with VA's grader (`gradeVideoActivityAnswer`)
 * so MA / FIB-with-variants grade correctly in the export — Quiz's grader
 * has no `'MA'` case and was returning 0 points for those columns (the
 * TODO PR2a left at `Results.tsx:170`).
 *
 * Also handles the small response-shape adapter: VA tracks completion via
 * `completedAt: number | null` (no separate `status` field), but the
 * shared exporter expects `submittedAt` + `status`. We derive both from
 * `completedAt` at the call site so consumers don't have to.
 */

import type { VideoActivityQuestion, VideoActivityResponse } from '@/types';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';
import {
  buildResultsSheetData,
  formatExportPoints,
  type BuildResultsSheetDataOptions,
  type ExportableResponse,
} from '@/utils/assignmentExportShared';

/**
 * Re-export so consumers don't have to know which file the helper lives
 * in. PR3b lifted it into a shared module; the call sites just want
 * "format export points" without caring where it comes from.
 */
export { formatExportPoints };

/**
 * Adapt a `VideoActivityResponse` to the `ExportableResponse` shape the
 * shared exporter consumes. The mapping is:
 *   completedAt: number → status: 'completed', submittedAt: completedAt
 *   completedAt: null   → status: 'in-progress', submittedAt: null
 *
 * Uses an explicit `!== null` check rather than truthiness so a
 * `completedAt: 0` (theoretical Jan 1 1970 timestamp; the type allows it)
 * still maps to `'completed'`.
 *
 * Pure function; safe to call inside .map().
 */
function toExportable(r: VideoActivityResponse): ExportableResponse {
  const completed = r.completedAt !== null;
  return {
    pin: r.pin,
    studentUid: r.studentUid,
    classPeriod: r.classPeriod,
    answers: r.answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
    })),
    status: completed ? 'completed' : 'in-progress',
    submittedAt: completed ? r.completedAt : null,
    tabSwitchWarnings: r.tabSwitchWarnings,
  };
}

/**
 * Build the headers + data rows for a Video Activity results sheet.
 * Mirrors `QuizDriveService.buildResultsSheetData` semantics — same
 * column layout, same options shape — but uses VA's grader so MA and
 * FIB-with-variants score correctly. Side-effect-free.
 */
export function buildVideoActivityResultsSheetData(
  responses: VideoActivityResponse[],
  questions: VideoActivityQuestion[],
  options?: BuildResultsSheetDataOptions
): { headers: string[]; dataRows: string[][] } {
  return buildResultsSheetData<VideoActivityQuestion, ExportableResponse>(
    responses.map(toExportable),
    questions,
    gradeVideoActivityAnswer,
    options
  );
}
