import React from 'react';
import { Z_INDEX } from '@/config/zIndex';
import { BadgePopover } from '@/components/common/BadgePopover';
import {
  pickedGroups,
  studentCountLabel,
  unnamedLabel,
  type PickedStudents,
} from '@/utils/assignedStudents';

const NAME_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-x-4';

/** One class's picked names: a wrapped line, or a hairline row per student. */
export const PickedNames: React.FC<{
  names: readonly string[];
  rows: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ names, rows, className = '', style }) =>
  rows ? (
    <ul className={`${NAME_GRID} ${className}`} style={style}>
      {names.map((n, i) => (
        <li
          key={`${i}-${n}`}
          className="border-b border-slate-200/70 py-1 text-slate-700 [overflow-wrap:anywhere]"
        >
          {n}
        </li>
      ))}
    </ul>
  ) : (
    <p
      className={`text-slate-600 [overflow-wrap:anywhere] ${className}`}
      style={style}
    >
      {names.join(' · ')}
    </p>
  );

/** Every picked student, under a heading per class. */
export const PickedStudentGroups: React.FC<{
  picked: PickedStudents;
  rows: boolean;
}> = ({ picked, rows }) => (
  <div className="flex flex-col gap-2.5">
    {pickedGroups(picked).map((g) => (
      <div key={g.label}>
        <div className="font-bold text-brand-blue-dark [overflow-wrap:anywhere]">
          {g.label}
        </div>
        <PickedNames names={g.names} rows={rows} />
      </div>
    ))}
    {picked.unnamed > 0 && (
      <p className="text-slate-500">{unnamedLabel(picked.unnamed)}</p>
    )}
  </div>
);

/** "N students" that opens the full list. */
export const PickedStudentsButton: React.FC<{ picked: PickedStudents }> = ({
  picked,
}) => {
  const label = studentCountLabel(picked.count);
  return (
    <BadgePopover
      triggerLabel={label}
      dialogLabel="Students"
      triggerClassName="touch-target-expand"
      panelZIndex={Z_INDEX.popover}
      panel={<PickedStudentGroups picked={picked} rows />}
    >
      <span className="font-semibold underline decoration-current/40 underline-offset-2 hover:decoration-current">
        {label}
      </span>
    </BadgePopover>
  );
};
