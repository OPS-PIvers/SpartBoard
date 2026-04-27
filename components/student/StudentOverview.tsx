import React from 'react';
import {
  AssignmentFilterTabs,
  type AssignmentFilterMode,
} from './AssignmentFilterTabs';
import { AssignmentSections } from './AssignmentSections';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';
import type { CompletionState } from './AssignmentListItem';

interface StudentOverviewProps {
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

export const StudentOverview: React.FC<StudentOverviewProps> = ({
  todayDate,
  active,
  completed,
  filterMode,
  onFilterChange,
  pseudonymUid,
  directoryById,
  onCompletionResolved,
}) => {
  const total = active.length + completed.length;
  const dueToday = active.length;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-blue-dark sm:text-3xl">
            Today
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {todayDate}
            {dueToday > 0 && (
              <>
                <span className="px-1.5 text-slate-300">·</span>
                <span>
                  {dueToday} {dueToday === 1 ? 'thing' : 'things'} due today
                </span>
              </>
            )}
          </p>
        </div>
        <AssignmentFilterTabs
          value={filterMode}
          onChange={onFilterChange}
          counts={{
            all: total,
            active: active.length,
            completed: completed.length,
          }}
        />
      </header>

      {total > 0 && (
        <p className="text-base font-medium text-slate-700">
          {dueToday > 0
            ? `You have ${dueToday} ${dueToday === 1 ? 'thing' : 'things'} due today. Pick a class on the left to see what's posted.`
            : "Nothing due today. Pick a class on the left to see what's posted."}
        </p>
      )}

      <AssignmentSections
        mode={filterMode}
        active={active}
        completed={completed}
        pseudonymUid={pseudonymUid}
        directoryById={directoryById}
        onCompletionResolved={onCompletionResolved}
      />
    </div>
  );
};
