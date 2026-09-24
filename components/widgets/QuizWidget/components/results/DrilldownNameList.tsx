import React from 'react';
import type { DrilldownStudent } from '@/utils/quizQuestionDrilldown';

interface DrilldownNameListProps {
  students: DrilldownStudent[];
  formatStudentName: (student: DrilldownStudent) => string;
  /** Opens that student's row on the Students screen; absent renders plain text. */
  onOpenStudent?: (responseKey: string) => void;
}

/** A plain list of the students behind one answer or outcome. */
export const DrilldownNameList: React.FC<DrilldownNameListProps> = ({
  students,
  formatStudentName,
  onOpenStudent,
}) => (
  <ul
    className="flex flex-col"
    style={{ gap: 'min(1px, 0.3cqmin)', marginTop: 'min(4px, 1cqmin)' }}
  >
    {students.map((s) => {
      const name = formatStudentName(s);
      return (
        <li
          key={s.responseKey}
          className="font-sans text-brand-gray-darkest min-w-0"
          style={{ fontSize: 'min(12px, 4cqmin)', lineHeight: 1.35 }}
        >
          {onOpenStudent ? (
            <button
              type="button"
              onClick={() => onOpenStudent(s.responseKey)}
              title={`Open ${name}'s answers`}
              className="max-w-full truncate text-left rounded hover:underline hover:text-brand-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
            >
              {name}
            </button>
          ) : (
            <span className="block truncate">{name}</span>
          )}
        </li>
      );
    })}
  </ul>
);
