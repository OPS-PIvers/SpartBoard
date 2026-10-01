import React from 'react';
import {
  flagChipClasses,
  formatScore,
  type GradebookColumn,
} from '@/utils/gradebook/gradebookModel';
import { useGradebook, type GradebookCell } from './GradebookContext';
import { Private } from './Private';
import { bandTint } from './cellFormat';

/** What a grid cell shows: value, flag chip and comment mark (D19). */
export const GradebookCellContent: React.FC<{
  cell: GradebookCell;
  column: GradebookColumn;
}> = ({ cell, column }) => {
  const { settings, view, scale } = useGradebook();
  const { final, mark } = cell;

  let inner: React.ReactNode;
  if (final.status === 'complete') {
    inner = <span className="text-slate-700">✓</span>;
  } else if (final.status === 'awaiting') {
    inner = (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xxs font-semibold text-amber-700">
        Ungraded
      </span>
    );
  } else if (final.status === 'scored') {
    const tone =
      final.source === 'override'
        ? 'text-brand-blue-primary font-bold'
        : view.tint
          ? bandTint(final.pct, scale)
          : '';
    const live =
      !cell.published && !column.completionOnly
        ? 'italic underline decoration-dotted decoration-amber-600 underline-offset-[3px]'
        : '';
    inner = (
      <Private className={`${tone} ${live}`}>
        {formatScore(final, view.cellFormat)}
      </Private>
    );
  } else {
    inner = <span className="text-slate-300">–</span>;
  }

  const defs = new Map(settings.flags.map((f) => [f.id, f]));
  const flags = final.flags.filter((f) => defs.has(f.id));
  const first = flags[0] ? defs.get(flags[0].id) : undefined;
  const flagNames = flags
    .map(
      (f) => `${defs.get(f.id)?.name ?? f.id}${f.auto ? ' (automatic)' : ''}`
    )
    .join(', ');

  return (
    <>
      {inner}
      {first && (
        <span
          className={`absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded px-[3px] text-[9.5px] font-bold leading-none ${flagChipClasses(first.color, flags[0].auto)}`}
          title={flagNames}
        >
          {first.key}
          {flags.length > 1 ? '+' : ''}
        </span>
      )}
      {mark?.comment?.text && (
        <span
          className={`absolute bottom-0 left-0 h-0 w-0 border-l-[8px] border-t-[8px] border-t-transparent ${
            mark.comment.shared
              ? 'border-l-brand-blue-primary'
              : 'border-l-slate-400'
          }`}
          title={
            mark.comment.shared
              ? 'Comment shared with student'
              : 'Private comment'
          }
        />
      )}
    </>
  );
};
