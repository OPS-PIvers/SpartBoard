// Results print on the student's kept scan page (docs/plans/QUIZ_PAPER_KEPT_PAGES.md §3.2, K8, K9, K20).
import type { PaperGrid, PaperImageMarkup, PaperPageMap } from '@/types';
import type { SheetFill } from './paperSheetPrint';
import type { QuizResultsPrintOptions } from './quizStudentReportPrint';

/** Where things sit on the printed page; the same geometry the redrawn sheet uses. */
export interface ScanSheetGeometry {
  batchId: string;
  seat: number;
  /** MC rows on the whole sheet; `SheetFill` arrays are indexed by sheet row. */
  questionCount: number;
  choiceCount: number;
  columnsPerPage: PaperGrid;
  /** This printed page's map, in the batch's own page numbering (prompt pages counted); absent before layoutVersion 2. */
  pageMap?: PaperPageMap;
}

/** One kept page to print with the report options drawn on top. */
export interface ScanSheetPageInput {
  /** The straightened page as a data URL, 215.9 × 279.4 mm at 150 dpi. */
  pageSrc: string;
  /** Printed sheet page number, as in the artifact id `pg_{scanId}_{page}`. */
  page: number;
  geometry: ScanSheetGeometry;
  /** Margin marks and key rings per sheet row, plus points and comment per written box (from `sheetFillFor`). */
  fill: SheetFill;
  /** Image markup by question id; only answers whose `page` is this page draw. */
  markup?: Readonly<Record<string, PaperImageMarkup>>;
  options: Pick<
    QuizResultsPrintOptions,
    | 'markAnswers'
    | 'keyMode'
    | 'questionScope'
    | 'showScore'
    | 'showWrittenFeedback'
  >;
}

/** Print styles for scan pages, added once beside `SHEET_REPRINT_STYLES`. */
export const SCAN_SHEET_STYLES = '';

/** One `<section>` printing the kept page with marks, key rings, points, markup and white patches; null falls back to the redrawn page. Stub until slice E. */
export function buildScanSheetPageHtml(
  _input: ScanSheetPageInput
): string | null {
  return null;
}
