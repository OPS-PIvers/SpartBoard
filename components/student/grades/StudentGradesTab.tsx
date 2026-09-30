import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { StudentGradesState } from '@/hooks/useStudentGrades';
import {
  isNewRow,
  seenMarksFor,
  writeSeenMarks,
  type SeenMarks,
  type StudentGradeRow,
} from '@/utils/gradebook/studentGrades';
import { StudentGradesList } from './StudentGradesList';
import { GradebookViewTabs, type GradebookView } from './GradebookViewTabs';
import { StudentTargetsView } from './StudentTargetsView';

interface StudentGradesTabProps {
  studentUid: string;
  classId: string;
  grades: StudentGradesState;
  rows: StudentGradeRow[];
  /** Marks stored before this visit, so New badges stay while the student looks. */
  seenAtOpen: SeenMarks;
  hrefBySession: Record<string, string>;
}

export const StudentGradesTab: React.FC<StudentGradesTabProps> = ({
  studentUid,
  classId,
  grades,
  rows,
  seenAtOpen,
  hrefBySession,
}) => {
  const [view, setView] = useState<GradebookView>('scores');
  const ready = grades.status === 'ready';
  useEffect(() => {
    if (ready) writeSeenMarks(studentUid, classId, seenMarksFor(rows));
  }, [ready, rows, studentUid, classId]);

  if (grades.status === 'loading') {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-slate-500">
        <Loader2
          className="h-8 w-8 animate-spin text-brand-blue-primary"
          aria-label="Loading grades"
        />
      </div>
    );
  }
  if (grades.status === 'error') {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
      >
        Your grades couldn&apos;t be loaded. Refresh to try again.
      </div>
    );
  }
  const hasTargets = grades.data.standards !== null;
  return (
    <div className="flex flex-col gap-6">
      {hasTargets && (
        <div>
          <GradebookViewTabs value={view} onChange={setView} />
        </div>
      )}
      {hasTargets && view === 'targets' ? (
        <StudentTargetsView data={grades.data} />
      ) : (
        <StudentGradesList
          data={grades.data}
          rows={rows}
          isNew={(row) => isNewRow(row, seenAtOpen)}
          hrefFor={(row) => hrefBySession[row.sessionId]}
        />
      )}
    </div>
  );
};
