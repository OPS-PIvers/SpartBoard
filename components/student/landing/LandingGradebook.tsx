import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { StudentGradesState } from '@/hooks/useStudentGrades';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import {
  isNewRow,
  readSeenMarks,
  seenMarksFor,
  studentGradeRows,
  writeSeenMarks,
  type SeenMarks,
} from '@/utils/gradebook/studentGrades';
import {
  gradebookItems,
  type DoneItem,
  type LandingPartition,
} from '@/utils/studentLanding';
import type { GradebookView } from '../grades/GradebookViewTabs';
import { StudentTargetsView } from '../grades/StudentTargetsView';
import { DoneRow, EmptyBox, ListBox } from './LandingRows';

interface LandingGradebookProps {
  grades: StudentGradesState;
  partition: LandingPartition;
  checks: TurnInMap;
  nowMs: number;
  /** Null keeps New marks out of browser storage (dev harness). */
  studentUid: string | null;
  classId: string;
  teachers: string;
  /** Marks to compare against when there is no stored copy. */
  initialSeen?: SeenMarks;
  onLockedClick: (a: AssignmentSummary) => void;
  onOpenGradeOnly: (item: DoneItem) => void;
}

const VIEWS: ReadonlyArray<{ id: GradebookView; label: string }> = [
  { id: 'scores', label: 'Scores' },
  { id: 'targets', label: 'Learning targets' },
];

/** D16 to D18: the Gradebook tab, Completed rows with scores, Late, comments and New. */
export const LandingGradebook: React.FC<LandingGradebookProps> = ({
  grades,
  partition,
  checks,
  nowMs,
  studentUid,
  classId,
  teachers,
  initialSeen,
  onLockedClick,
  onOpenGradeOnly,
}) => {
  const [view, setView] = useState<GradebookView>('scores');
  // Read once per visit so New stays up while the student looks.
  const [seenAtOpen] = useState<SeenMarks>(() =>
    studentUid ? readSeenMarks(studentUid, classId) : (initialSeen ?? {})
  );
  const gradeRows = useMemo(
    () => (grades.status === 'ready' ? studentGradeRows(grades.data) : []),
    [grades]
  );
  const items = useMemo(
    () => gradebookItems(partition, gradeRows),
    [partition, gradeRows]
  );
  const ready = grades.status === 'ready';
  useEffect(() => {
    if (ready && studentUid)
      writeSeenMarks(studentUid, classId, seenMarksFor(gradeRows));
  }, [ready, gradeRows, studentUid, classId]);

  if (grades.status === 'loading') {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
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
    <div className="flex flex-col gap-3">
      {hasTargets && (
        <div
          role="tablist"
          aria-label="Gradebook view"
          {...tourAttr('gradebook.student-view.tab')}
          className="inline-flex self-end rounded-lg bg-slate-200/70 p-0.5 text-xs font-semibold"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded-md px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                view === v.id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {hasTargets && view === 'targets' ? (
        <StudentTargetsView data={grades.data} />
      ) : items.length ? (
        <ListBox>
          {items.map((item) => (
            <DoneRow
              key={item.key}
              item={item}
              check={checks[item.key]}
              nowMs={nowMs}
              gradebook
              isNew={!!item.grade && isNewRow(item.grade, seenAtOpen)}
              teachers={teachers}
              onLockedClick={onLockedClick}
              onOpenGradeOnly={onOpenGradeOnly}
            />
          ))}
        </ListBox>
      ) : (
        <EmptyBox text="No grades yet." />
      )}
    </div>
  );
};
