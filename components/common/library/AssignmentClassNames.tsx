import React from 'react';
import { Z_INDEX } from '@/config/zIndex';
import { BadgePopover } from '@/components/common/BadgePopover';
import { classCountLabel, uniqueClassNames } from './assignmentClassNames';

interface AssignmentClassNamesProps {
  names: readonly (string | null | undefined)[];
}

/** "N classes" in an assignment row; tap it to list every class in full. */
export const AssignmentClassNames: React.FC<AssignmentClassNamesProps> = ({
  names,
}) => {
  const list = uniqueClassNames(names);
  if (list.length === 0) return null;
  const label = classCountLabel(list.length);
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
