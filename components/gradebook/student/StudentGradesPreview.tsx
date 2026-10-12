import React, { useMemo, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { Btn } from '@/components/admin/Organization/components/primitives';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { tourAttr } from '@/config/tourAnchors';
import {
  NewBadge,
  StudentGradesList,
} from '@/components/student/grades/StudentGradesList';
import {
  GradebookViewTabs,
  type GradebookView,
} from '@/components/student/grades/GradebookViewTabs';
import { StudentTargetsView } from '@/components/student/grades/StudentTargetsView';
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
    <Btn
      variant="primary"
      {...tourAttr('gradebook.student.preview')}
      onClick={onClick}
    >
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
  const [view, setView] = useState<GradebookView>('scores');
  const data = useMemo(() => buildStudentGradesPreview(inputs), [inputs]);
  const rows = useMemo(() => studentGradeRows(data), [data]);
  const isNew = (row: StudentGradeRow) =>
    row.status !== 'hidden' &&
    inputs.now - row.updatedAt < PREVIEW_NEW_WINDOW_MS;
  const anyNew = rows.some(isNew);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-brand-blue-primary px-4 py-2.5 text-sm text-white">
        <b>
          Previewing as {firstName} {lastName}
        </b>
        <span>This is exactly what the student sees.</span>
        <span className="flex-1" />
        <Btn
          size="sm"
          {...tourAttr('gradebook.student.preview-exit')}
          onClick={onExit}
        >
          Back to gradebook
        </Btn>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
        <nav
          aria-label="My classes"
          className="flex flex-col gap-0.5 self-start text-sm"
        >
          <div className="px-3 py-2 text-xs text-slate-500">My classes</div>
          <div className="rounded-lg bg-brand-blue-primary px-3 py-2 font-semibold text-white">
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
                  label: 'Gradebook',
                  badge: anyNew ? <NewBadge /> : undefined,
                },
              ]}
            />
          </div>
          {data.standards !== null && (
            <div className="mt-3">
              <GradebookViewTabs value={view} onChange={setView} />
            </div>
          )}
          {data.standards !== null && view === 'targets' ? (
            <StudentTargetsView data={data} />
          ) : (
            <StudentGradesList
              data={data}
              rows={rows}
              isNew={isNew}
              teacherPreview
            />
          )}
        </div>
      </div>
    </div>
  );
};
