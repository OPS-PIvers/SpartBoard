import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { HeldStudent } from '@/utils/assignedStatus';
import type { StudentName } from '@/hooks/useAssignmentPseudonyms';
import { heldRows, useHeldStudentNames } from './heldStudentsData';

/** Hairline rows of held students and their times. */
export const HeldStudentsList: React.FC<{
  students: readonly HeldStudent[];
  names: ReadonlyMap<string, StudentName> | null;
  /** Font size; the Assigned row passes a container-scaled one. */
  fontSize?: string;
  /** Lines the time up under the row's status column. */
  rowColumns?: boolean;
}> = ({ students, names, fontSize = '14px', rowColumns = false }) => (
  <ul className="divide-y divide-slate-200" style={{ fontSize }}>
    {heldRows(students, names).map((r) => (
      <li
        key={r.uid}
        className={
          rowColumns
            ? 'grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)] items-baseline [@container(max-width:600px)]:grid-cols-1'
            : 'flex flex-wrap items-baseline justify-between'
        }
        style={{
          columnGap: rowColumns ? 'var(--asg-gap)' : '0.75em',
          rowGap: '0.15em',
          padding: '0.45em 0',
        }}
      >
        <span className="min-w-0 font-semibold text-slate-800 [overflow-wrap:anywhere]">
          {r.name}
        </span>
        <span
          className="inline-flex items-center text-slate-600 tabular-nums"
          style={{ gap: '0.35em' }}
        >
          <CalendarClock
            aria-hidden
            className="shrink-0"
            style={{ width: '1.05em', height: '1.05em' }}
          />
          {r.time}
        </span>
      </li>
    ))}
  </ul>
);

/** The Assigned row's always-visible list of students scheduled for later. */
export const AssignedHeldStudents: React.FC<{
  assignmentId: string;
  classIds?: string[];
  students: readonly HeldStudent[];
}> = ({ assignmentId, classIds, students }) => {
  const names = useHeldStudentNames(assignmentId, classIds, true);
  return (
    <div className="border-t border-slate-200/70">
      <div
        className="font-semibold text-slate-600"
        style={{
          fontSize: 'min(12px, 3.4cqmin)',
          paddingTop: 'min(4px, 1cqmin)',
        }}
      >
        Scheduled for later
      </div>
      <HeldStudentsList
        students={students}
        names={names}
        fontSize="min(12.5px, 3.6cqmin)"
        rowColumns
      />
    </div>
  );
};

/** Shown after a Close leaves students scheduled for later: who they are and when. */
export const HeldStudentsDialog: React.FC<{
  /** "Period 3", or null when every class closed at once. */
  classLabel: string | null;
  students: readonly HeldStudent[];
  names: ReadonlyMap<string, StudentName> | null;
  accent?: string;
  onClose: () => void;
}> = ({ classLabel, students, names, accent, onClose }) => (
  <Modal
    accent={accent}
    isOpen
    onClose={onClose}
    title={classLabel ? `${classLabel} is closed` : 'Every class is closed'}
    zIndex="z-modal-deep"
    maxWidth="max-w-md"
    contentClassName="px-6 pb-4"
    footer={
      <div className="flex justify-center">
        {/* no-tour-anchor: OK only dismisses this notice */}
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-brand-blue-primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark"
        >
          OK
        </button>
      </div>
    }
  >
    <p className="text-sm text-slate-700">
      Any student scheduled for later is saved.
    </p>
    <div className="mt-2">
      <HeldStudentsList students={students} names={names} />
    </div>
  </Modal>
);

/** The Close notice outside the monitor, resolving names itself. */
export const AssignedHeldDialog: React.FC<{
  assignmentId: string;
  classIds?: string[];
  classLabel: string | null;
  students: readonly HeldStudent[];
  accent?: string;
  onClose: () => void;
}> = ({ assignmentId, classIds, ...rest }) => {
  const names = useHeldStudentNames(assignmentId, classIds, true);
  return <HeldStudentsDialog names={names} {...rest} />;
};
