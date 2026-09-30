import React, { useMemo, useState } from 'react';
import {
  AssignmentFilterTabs,
  type AssignmentFilterMode,
} from './AssignmentFilterTabs';
import { AssignmentSections } from './AssignmentSections';
import { getClassColor } from '@/utils/studentClassColors';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';
import type { CompletionState } from './AssignmentListItem';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { useStudentGrades } from '@/hooks/useStudentGrades';
import {
  isNewRow,
  readSeenMarks,
  studentGradeRows,
} from '@/utils/gradebook/studentGrades';
import { NewBadge } from './grades/StudentGradesList';
import { StudentGradesTab } from './grades/StudentGradesTab';

import type { StudentClassTab } from '@/utils/myAssignmentsPath';

export type { StudentClassTab };

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
  pendingVerificationKeys?: ReadonlySet<string>;
  /** `student-gradebook` is open to students (D38); off leaves the view unchanged. */
  gradesEnabled?: boolean;
  tab?: StudentClassTab;
  onTabChange?: (tab: StudentClassTab) => void;
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
  pendingVerificationKeys,
  gradesEnabled = false,
  tab = 'assignments',
  onTabChange,
}) => {
  const grades = useStudentGrades(pseudonymUid, classId, gradesEnabled);
  // Read once per class visit so New badges stay up while the student looks (D36).
  const [seenAtOpen] = useState(() =>
    pseudonymUid ? readSeenMarks(pseudonymUid, classId) : {}
  );
  const gradeRows = useMemo(
    () => (grades.status === 'ready' ? studentGradeRows(grades.data) : []),
    [grades]
  );
  const hasNewGrades = gradeRows.some((r) => isNewRow(r, seenAtOpen));
  const hrefBySession = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of [...active, ...completed]) out[a.sessionId] = a.openHref;
    return out;
  }, [active, completed]);
  const showGrades = gradesEnabled && tab === 'grades' && !!pseudonymUid;

  const color = getClassColor(classId);
  const className = classEntry?.name ?? 'Class';
  const subject = classEntry?.subject;
  const teacher = classEntry?.teacherDisplayName;
  const code = classEntry?.code;

  const subtitleBits = [subject, teacher, code].filter(
    (b): b is string => Boolean(b) && typeof b === 'string'
  );
  const subtitle = subtitleBits.length > 0 ? subtitleBits.join(' · ') : null;

  const filterTabs = (
    <AssignmentFilterTabs
      value={filterMode}
      onChange={onFilterChange}
      counts={{
        active: active.length,
        completed: completed.length,
      }}
    />
  );

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
        {gradesEnabled ? (
          <div className="self-start sm:self-auto">
            <SegmentedControl<StudentClassTab>
              ariaLabel="Class view"
              value={tab}
              onChange={(t) => onTabChange?.(t)}
              options={[
                { value: 'assignments', label: 'Assignments' },
                {
                  value: 'grades',
                  label: 'Gradebook',
                  badge: hasNewGrades ? <NewBadge /> : undefined,
                },
              ]}
            />
          </div>
        ) : (
          filterTabs
        )}
      </header>

      {gradesEnabled && !showGrades && <div>{filterTabs}</div>}

      {showGrades && pseudonymUid ? (
        <StudentGradesTab
          studentUid={pseudonymUid}
          classId={classId}
          grades={grades}
          rows={gradeRows}
          seenAtOpen={seenAtOpen}
          hrefBySession={hrefBySession}
        />
      ) : (
        <AssignmentSections
          mode={filterMode}
          active={active}
          completed={completed}
          pseudonymUid={pseudonymUid}
          directoryById={directoryById}
          hideClassName
          onCompletionResolved={onCompletionResolved}
          pendingVerificationKeys={pendingVerificationKeys}
        />
      )}
    </div>
  );
};
