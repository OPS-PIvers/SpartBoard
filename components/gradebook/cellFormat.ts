import {
  formatScore,
  type GradebookColumn,
} from '@/utils/gradebook/gradebookModel';
import {
  proficiencyLevel,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import { SCALE_COLOR_STYLES } from '@/utils/gradebook/scaleColors';
import type { GradebookCell } from './GradebookContext';

/** Tint text color for a percent on the scale; empty with no value. */
export function bandTint(pct: number | null, scale: ProficiencyScale): string {
  const level = proficiencyLevel(pct, scale);
  return level === null
    ? ''
    : SCALE_COLOR_STYLES[scale.levels[level].color].tint;
}

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
