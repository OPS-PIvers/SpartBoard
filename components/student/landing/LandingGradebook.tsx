import React, { useMemo, useState } from 'react';
import { useStudentGrades } from '@/hooks/useStudentGrades';
import {
  readSeenMarks,
  studentGradeRows,
} from '@/utils/gradebook/studentGrades';
import { StudentGradesTab } from '../grades/StudentGradesTab';

interface LandingGradebookProps {
  studentUid: string;
  classId: string;
  hrefBySession: Record<string, string>;
}

/** D16: the Gradebook tab body, the existing student grades view for one class. */
export const LandingGradebook: React.FC<LandingGradebookProps> = ({
  studentUid,
  classId,
  hrefBySession,
}) => {
  const grades = useStudentGrades(studentUid, classId, true);
  // Read once per class visit so New badges stay up while the student looks.
  const [seenAtOpen] = useState(() => readSeenMarks(studentUid, classId));
  const rows = useMemo(
    () => (grades.status === 'ready' ? studentGradeRows(grades.data) : []),
    [grades]
  );
  return (
    <StudentGradesTab
      studentUid={studentUid}
      classId={classId}
      grades={grades}
      rows={rows}
      seenAtOpen={seenAtOpen}
      hrefBySession={hrefBySession}
    />
  );
};
