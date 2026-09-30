import React, { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useGradebook } from './GradebookContext';
import { GradebookCellContent } from './GradebookCellContent';
import { cellAnchorId, cellAriaLabel } from './cellFormat';
import { GradebookPopovers } from './GradebookPopovers';
import { GRADEBOOK_KIND_META } from './kindMeta';
import { Private } from './Private';

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

/** Phone layout (D33): the student list, then one student's assignments. */
export const GradebookPhoneView: React.FC = () => {
  const { students, columns, getCell, overall, view, closePopover, openCell } =
    useGradebook();
  const [selected, setSelected] = useState<string | null>(null);
  const student = students.find((s) => s.uid === selected) ?? null;

  if (!student) {
    return (
      <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {students.map((s) => {
          const o = overall(s.uid);
          return (
            <li
              key={s.uid}
              className="border-b border-slate-100 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => setSelected(s.uid)}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <Private className="block truncate text-sm font-medium text-slate-800">
                    {s.displayName}
                  </Private>
                  {s.missing > 0 && (
                    <span className="block text-[11px] font-medium text-brand-red-primary">
                      {s.missing} missing
                    </span>
                  )}
                </span>
                <Private className="text-sm font-bold text-slate-900">
                  {o.pct === null ? '–' : `${o.pct.toFixed(1)}%`}
                </Private>
                <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const newestFirst = [...columns].reverse();
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          closePopover();
          setSelected(null);
        }}
        className="inline-flex h-9 items-center gap-2 self-start rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        <Private>{student.displayName}</Private>
      </button>
      <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {newestFirst.map((c) => {
          const cell = getCell(c.sessionId, student.uid);
          const Icon = GRADEBOOK_KIND_META[c.kind].icon;
          const na = cell.final.status === 'not-assigned';
          return (
            <li
              key={c.sessionId}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-b-0"
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {c.title}
                </span>
                {c.dueAt && (
                  <span className="block text-[11px] text-slate-500">
                    {dateFmt.format(c.dueAt)}
                  </span>
                )}
              </span>
              <button
                type="button"
                data-gb-cell={cellAnchorId(c.sessionId, student.uid)}
                disabled={na}
                onClick={() => openCell(c.sessionId, student.uid)}
                aria-label={cellAriaLabel(
                  student.displayName,
                  c,
                  cell,
                  view.cellFormat
                )}
                className="relative grid h-11 w-24 place-items-center rounded-lg border border-slate-200 text-sm font-medium text-slate-800 disabled:border-dashed disabled:text-xs disabled:text-slate-400"
              >
                {na ? (
                  'Not assigned'
                ) : (
                  <GradebookCellContent cell={cell} column={c} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <GradebookPopovers onCellClose={closePopover} />
    </div>
  );
};
