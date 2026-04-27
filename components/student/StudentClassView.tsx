import React from 'react';
import {
  AssignmentFilterTabs,
  type AssignmentFilterMode,
} from './AssignmentFilterTabs';
import { AssignmentSections } from './AssignmentSections';
import { getClassColor } from '@/utils/studentClassColors';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';
import type { CompletionState } from './AssignmentListItem';

interface StudentClassViewProps {
  classId: string;
  classEntry: ClassDirectoryEntry | undefined;
  todayDate: string;
  active: AssignmentSummary[];
  completed: AssignmentSummary[];
  filterMode: AssignmentFilterMode;
  onFilterChange: (mode: AssignmentFilterMode) => void;
  pseudonymUid: string | null;
  directoryById: Record<string, ClassDirectoryEntry>;
  onCompletionResolved: (
    sessionId: string,
    kind: AssignmentSummary['kind'],
    completion: CompletionState
  ) => void;
}

export const StudentClassView: React.FC<StudentClassViewProps> = ({
  classId,
  classEntry,
  todayDate,
  active,
  completed,
  filterMode,
  onFilterChange,
  pseudonymUid,
  directoryById,
  onCompletionResolved,
}) => {
  const color = getClassColor(classId);
  const className = classEntry?.name ?? 'Class';
  const subject = classEntry?.subject;
  const teacher = classEntry?.teacherDisplayName;
  const code = classEntry?.code;

  const subtitleBits = [subject, teacher, code].filter(
    (b): b is string => Boolean(b) && typeof b === 'string'
  );
  const subtitle = subtitleBits.length > 0 ? subtitleBits.join(' · ') : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1.5 h-7 w-1 shrink-0 rounded-full sm:mt-2"
            style={{ background: color.bar }}
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {className}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            )}
            <p className="mt-0.5 text-xs text-slate-400">{todayDate}</p>
          </div>
        </div>
        <AssignmentFilterTabs
          value={filterMode}
          onChange={onFilterChange}
          counts={{
            all: active.length + completed.length,
            active: active.length,
            completed: completed.length,
          }}
        />
      </header>

      <AssignmentSections
        mode={filterMode}
        active={active}
        completed={completed}
        pseudonymUid={pseudonymUid}
        directoryById={directoryById}
        hideClassName
        onCompletionResolved={onCompletionResolved}
      />
    </div>
  );
};
