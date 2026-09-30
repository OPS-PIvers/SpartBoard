// Gradebook export rows for CSV and Sheets (docs/plans/GRADEBOOK.md D30).
import {
  isCompletionOnly,
  type FinalScore,
  type GradebookFlagDef,
  type GradebookKind,
  type OverallResult,
} from '@/utils/gradebook/gradebookCore';
import {
  studentName,
  type CellFormat,
  type NameFormat,
} from '@/utils/gradebook/gradebookModel';

export interface GradebookExportOptions {
  nameFormat: NameFormat;
  scoreFormat: CellFormat;
  /** Adds each cell's flag codes after its score (e.g. "0 M"). */
  flagsAsCodes: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: GradebookExportOptions = {
  nameFormat: 'last-first',
  scoreFormat: 'percent',
  flagsAsCodes: true,
};

/** Only names: accommodations and groups never reach an export (D32). */
export interface GradebookExportStudent {
  uid: string;
  firstName: string;
  lastName: string;
}

export interface GradebookExportColumn {
  sessionId: string;
  title: string;
  kind: GradebookKind;
  /** Points the column is out of, for the header in points mode. */
  max: number | null;
}

/** The grid's current view: filtered, visible students and columns in display order. */
export interface GradebookExportView {
  students: GradebookExportStudent[];
  columns: GradebookExportColumn[];
  cell: (studentUid: string, sessionId: string) => FinalScore;
  overall: (studentUid: string) => OverallResult | null;
  flagDefs: GradebookFlagDef[];
}

/** A cell is a number when it is a bare score, so Sheets can total it. */
export type ExportCell = string | number;

const round1 = (n: number): number => Math.round(n * 10) / 10;

function scoreText(
  final: FinalScore,
  kind: GradebookKind,
  format: CellFormat
): ExportCell {
  if (isCompletionOnly(kind)) return final.status === 'complete' ? 'Done' : '';
  switch (final.status) {
    case 'scored':
      if (format === 'points')
        return final.points === null ? '' : round1(final.points);
      return final.pct === null ? '' : Math.round(final.pct);
    case 'excluded':
      return 'Excused';
    case 'awaiting':
      return 'Ungraded';
    default:
      return '';
  }
}

function withFlags(
  value: ExportCell,
  final: FinalScore,
  codes: Map<string, string>
): ExportCell {
  const letters = final.flags
    .map((f) => codes.get(f.id))
    .filter((c): c is string => !!c);
  if (letters.length === 0) return value;
  const shown = final.status === 'excluded' ? '' : String(value);
  return [shown, letters.join(' ')].filter((p) => p !== '').join(' ');
}

function columnHeader(c: GradebookExportColumn, format: CellFormat): string {
  if (isCompletionOnly(c.kind)) return c.title;
  if (format === 'points')
    return c.max !== null ? `${c.title} (${round1(c.max)})` : c.title;
  return `${c.title} (%)`;
}

function overallCell(o: OverallResult | null, format: CellFormat): ExportCell {
  if (!o) return '';
  if (format === 'points')
    return o.max > 0 ? `${round1(o.points)}/${round1(o.max)}` : '';
  return o.pct === null ? '' : Math.round(o.pct);
}

/** Header row, then one row per student: name, each column, overall. */
export function buildGradebookExportRows(
  view: GradebookExportView,
  options: GradebookExportOptions
): ExportCell[][] {
  const codes = new Map(
    view.flagDefs
      .filter((f) => f.visibility !== 'off')
      .map((f) => [f.id, f.key])
  );
  const header: ExportCell[] = [
    'Student',
    ...view.columns.map((c) => columnHeader(c, options.scoreFormat)),
    options.scoreFormat === 'points' ? 'Overall (points)' : 'Overall (%)',
  ];
  const rows = view.students.map((s) => [
    studentName(s, options.nameFormat),
    ...view.columns.map((c) => {
      const final = view.cell(s.uid, c.sessionId);
      const value = scoreText(final, c.kind, options.scoreFormat);
      return options.flagsAsCodes ? withFlags(value, final, codes) : value;
    }),
    overallCell(view.overall(s.uid), options.scoreFormat),
  ]);
  return [header, ...rows];
}

/** File and sheet title: class name plus today's date. */
export function exportTitle(className: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${className.trim() || 'Gradebook'} grades ${date}`;
}
