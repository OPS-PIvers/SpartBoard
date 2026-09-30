import React from 'react';
import {
  STUDENT_GRADE_KIND_LABELS,
  formatDueDate,
  formatPoints,
  type StudentGradeRow,
  type StudentGradesData,
} from '@/utils/gradebook/studentGrades';

const FLAG_TINT: Record<string, string> = {
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const NewBadge: React.FC = () => (
  <span className="rounded bg-brand-red-primary px-[5px] py-px text-[10px] font-bold leading-[1.2] tracking-wide text-white">
    NEW
  </span>
);

const Score: React.FC<{ row: StudentGradeRow }> = ({ row }) => {
  if (row.status === 'complete') return <>✓</>;
  if (row.status === 'excluded')
    return <span className="text-xs font-normal text-slate-500">Excused</span>;
  if (row.status !== 'scored' || row.points === null || row.max === null)
    return <>—</>;
  return (
    <>
      {formatPoints(row.points)}/{formatPoints(row.max)}
      {row.pct !== null && (
        <div className="text-xs font-normal text-slate-500">
          {Math.round(row.pct)}%
        </div>
      )}
    </>
  );
};

const GradeRow: React.FC<{
  row: StudentGradeRow;
  isNew: boolean;
  href?: string;
}> = ({ row, isNew, href }) => {
  const due = formatDueDate(row.dueAt);
  // The score column already says Excused.
  const flags =
    row.status === 'excluded'
      ? row.flags.filter((f) => f.id !== 'excused')
      : row.flags;
  const body = (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
          <span className="min-w-0 break-words">{row.title}</span>
          {isNew && <NewBadge />}
        </div>
        <div className="text-xs text-slate-500">
          {STUDENT_GRADE_KIND_LABELS[row.kind]}
          {due && ` · due ${due}`}
        </div>
        {flags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <span
                key={f.id}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${FLAG_TINT[f.color] ?? FLAG_TINT.slate}`}
              >
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right text-xl font-bold tabular-nums text-slate-900">
        <Score row={row} />
      </div>
      {row.comment && (
        <p className="col-span-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-500">Teacher comment </span>
          {row.comment}
        </p>
      )}
    </>
  );
  const cls =
    'grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1.5 px-5 py-4';
  return (
    <li>
      {href ? (
        <a
          href={href}
          className={`${cls} transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary`}
        >
          {body}
        </a>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
};

interface StudentGradesListProps {
  data: StudentGradesData;
  rows: StudentGradeRow[];
  isNew: (row: StudentGradeRow) => boolean;
  hrefFor?: (row: StudentGradeRow) => string | undefined;
  /** Teacher preview adds the lines the prototype shows only to the teacher. */
  teacherPreview?: boolean;
}

export const StudentGradesList: React.FC<StudentGradesListProps> = ({
  data,
  rows,
  isNew,
  hrefFor,
  teacherPreview,
}) => (
  <div className="flex flex-col gap-6">
    {rows.length === 0 ? (
      <div className="py-12 text-center text-sm text-slate-500">
        <b className="mb-1 block text-[15px] text-slate-900">
          No grades to show yet
        </b>
        Your teacher hasn&apos;t shared grades for this class.
      </div>
    ) : (
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {rows.map((row) => (
          <GradeRow
            key={row.sessionId}
            row={row}
            isNew={isNew(row)}
            href={hrefFor?.(row)}
          />
        ))}
      </ul>
    )}
    {teacherPreview && data.standards === null && (
      <div className="text-xs text-slate-700">
        Standards mastery is off for this class. Turn it on in Settings.
      </div>
    )}
    {teacherPreview && (
      <div className="text-xs text-slate-500">
        Unpublished work, private comments and hidden flags never reach the
        student.
      </div>
    )}
  </div>
);
