import {
  formatScore,
  type GradebookColumn,
} from '@/utils/gradebook/gradebookModel';
import type { GradebookCell } from './GradebookContext';

/** Text color per proficiency level: top, middle, bottom. */
export const BAND_TEXT = [
  'text-emerald-600',
  'text-amber-600',
  'text-brand-red-primary',
] as const;

export const cellAnchorId = (sessionId: string, uid: string): string =>
  `${sessionId}|${uid}`;

/** Screen-reader label for a cell. */
export function cellAriaLabel(
  studentName: string,
  column: GradebookColumn,
  cell: GradebookCell,
  format: 'percent' | 'points'
): string {
  const f = cell.final;
  const value =
    f.status === 'scored'
      ? formatScore(f, format)
      : f.status === 'complete'
        ? 'submitted'
        : f.status === 'awaiting'
          ? 'ungraded'
          : f.status === 'not-assigned'
            ? 'not assigned'
            : f.status === 'excluded'
              ? 'excused'
              : 'no score';
  return `${studentName}, ${column.title}: ${value}`;
}
