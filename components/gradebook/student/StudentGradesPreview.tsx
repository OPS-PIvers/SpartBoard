import React, { useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { Btn } from '@/components/admin/Organization/components/primitives';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import {
  NewBadge,
  StudentGradesList,
} from '@/components/student/grades/StudentGradesList';
import {
  buildStudentGradesPreview,
  studentGradeRows,
  type PreviewInputs,
  type StudentGradeRow,
} from '@/utils/gradebook/studentGrades';

/** D26: shown on the teacher student view only while `student-gradebook` passes. */
export const PreviewAsStudentButton: React.FC<{ onClick: () => void }> = ({
  onClick,
}) => {
  const { canAccessFeature } = useAuth();
  if (!canAccessFeature('student-gradebook')) return null;
  return (
    <Btn variant="primary" onClick={onClick}>
      Preview as student
    </Btn>
  );
};

interface StudentGradesPreviewProps {
  firstName: string;
  lastName: string;
  className: string;
  inputs: PreviewInputs;
  onExit: () => void;
}

// Recently changed rows stand in for the student's unseen ones; the teacher can't read their seen marks.
const PREVIEW_NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** D26 Preview as student: the student's Grades tab built from the same core the server projection uses. */
export const StudentGradesPreview: React.FC<StudentGradesPreviewProps> = ({
  firstName,
  lastName,
  className,
  inputs,
  onExit,
}) => {
  const data = useMemo(() => buildStudentGradesPreview(inputs), [inputs]);
  const rows = useMemo(() => studentGradeRows(data), [data]);
  const isNew = (row: StudentGradeRow) =>
    row.status !== 'hidden' &&
    inputs.now - row.updatedAt < PREVIEW_NEW_WINDOW_MS;
  const anyNew = rows.some(isNew);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark px-4 py-2.5 text-sm text-white">
        <b>
          Previewing as {firstName} {lastName}
        </b>
        <span>This is exactly what the student sees.</span>
        <span className="flex-1" />
        <Btn size="sm" onClick={onExit}>
          Back to gradebook
        </Btn>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
        <nav
          aria-label="My classes"
          className="flex flex-col gap-0.5 self-start rounded-2xl border border-slate-200 bg-white p-2 text-sm"
        >
          <div className="px-3 py-2.5 text-xs text-slate-500">My classes</div>
          <div className="rounded-xl bg-brand-blue-primary px-3 py-2.5 font-semibold text-white">
            {className}
          </div>
        </nav>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{className}</h2>
            <span className="flex-1" />
            <SegmentedControl
              ariaLabel="Class view"
              value="grades"
              onChange={() => undefined}
              options={[
                { value: 'assignments', label: 'Assignments' },
                {
                  value: 'grades',
                  label: 'Grades',
                  badge: anyNew ? <NewBadge /> : undefined,
                },
              ]}
            />
          </div>
          <StudentGradesList
            data={data}
            rows={rows}
            isNew={isNew}
            teacherPreview
          />
        </div>
      </div>
    </div>
  );
};
