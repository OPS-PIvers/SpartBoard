import React from 'react';
import { Z_INDEX } from '@/config/zIndex';
import { BadgePopover } from '@/components/common/BadgePopover';
import { classCountLabel, uniqueClassNames } from './assignmentClassLabels';
import {
  studentCountLabel,
  type PickedStudents,
} from '@/utils/assignedStudents';
import { PickedStudentGroups } from './PickedStudentNames';

interface AssignmentClassNamesProps {
  names: readonly (string | null | undefined)[];
  /** A run that went to picked students lists them too. */
  picked?: PickedStudents | null;
}

/** "N classes" in an assignment row; tap it to list every class in full. */
export const AssignmentClassNames: React.FC<AssignmentClassNamesProps> = ({
  names,
  picked,
}) => {
  const list = uniqueClassNames(names);
  if (list.length === 0) return null;
  const label = picked
    ? `${classCountLabel(list.length)} · ${studentCountLabel(picked.count)}`
    : classCountLabel(list.length);
  if (picked)
    return (
      <BadgePopover
        triggerLabel={label}
        dialogLabel="Students"
        triggerClassName="touch-target-expand"
        panelZIndex={Z_INDEX.popover}
        panel={<PickedStudentGroups picked={picked} />}
      >
        <span
          data-testid="assignment-class-names"
          className="font-semibold underline decoration-current/40 underline-offset-2 hover:decoration-current"
        >
          {label}
        </span>
      </BadgePopover>
    );
  return (
    <BadgePopover
      triggerLabel={label}
      dialogLabel="Classes"
      triggerClassName="touch-target-expand"
      panelZIndex={Z_INDEX.popover}
      panel={
        <ul className="divide-y divide-slate-200/70">
          {list.map((name) => (
            <li
              key={name}
              className="py-1.5 font-semibold text-slate-700 [overflow-wrap:anywhere] first:pt-0 last:pb-0"
            >
              {name}
            </li>
          ))}
        </ul>
      }
    >
      <span
        data-testid="assignment-class-names"
        className="font-semibold underline decoration-current/40 underline-offset-2 hover:decoration-current"
      >
        {label}
      </span>
    </BadgePopover>
  );
};
