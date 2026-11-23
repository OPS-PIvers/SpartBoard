import React from 'react';
import {
  pickedGroups,
  unnamedLabel,
  type PickedStudents,
} from '@/utils/assignedStudents';

/** One class's picked names on a wrapped line. */
export const PickedNames: React.FC<{
  names: readonly string[];
  className?: string;
  style?: React.CSSProperties;
}> = ({ names, className = '', style }) => (
  <p
    className={`text-slate-600 [overflow-wrap:anywhere] ${className}`}
    style={style}
  >
    {names.join(' · ')}
  </p>
);

/** Every picked student, under a heading per class. */
export const PickedStudentGroups: React.FC<{ picked: PickedStudents }> = ({
  picked,
}) => (
  <div className="flex flex-col gap-2.5">
    {pickedGroups(picked).map((g, gi) => (
      <div key={`${gi}-${g.label}`}>
        <div className="font-bold text-brand-blue-dark [overflow-wrap:anywhere]">
          {g.label}
        </div>
        <PickedNames names={g.names} />
      </div>
    ))}
    {picked.unnamed > 0 && (
      <p className="text-slate-500">{unnamedLabel(picked.unnamed)}</p>
    )}
  </div>
);
