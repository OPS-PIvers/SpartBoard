import React, { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { HeldStudent } from '@/utils/assignedStatus';
import type { StudentName } from '@/hooks/useAssignmentPseudonyms';
import type { PassHold } from '@/types';
import { useDialog } from '@/context/useDialog';
import { setHeldStudentTime } from '@/utils/heldStudentTime';
import { logError } from '@/utils/logError';
import { SetStudentTimeDialog } from '@/components/widgets/QuizWidget/components/monitor/SetStudentTimeDialog';
import { heldRows, useHeldStudentNames } from './heldStudentsData';

/** Where an edit or removal of a held student's time is written. */
export interface HeldStudentEditTarget {
  teacherUid: string;
  assignmentId: string;
  hold: PassHold | null | undefined;
  dueAt?: number | null;
}

const LINK =
  'touch-target-expand relative rounded font-semibold text-brand-blue-primary hover:underline disabled:opacity-40';

/** Hairline rows of held students and their times, each with Edit and Remove when `edit` is given. */
export const HeldStudentsList: React.FC<{
  students: readonly HeldStudent[];
  names: ReadonlyMap<string, StudentName> | null;
  /** Font size; the Assigned row passes a container-scaled one. */
  fontSize?: string;
  /** Lines the time up under the row's status column. */
  rowColumns?: boolean;
  edit?: HeldStudentEditTarget | null;
  /** Reports a failed write, as the caller shows errors. */
  onError?: (message: string) => void;
}> = ({
  students,
  names,
  fontSize = '14px',
  rowColumns = false,
  edit,
  onError,
}) => {
  const { showConfirm } = useDialog();
  const [editing, setEditing] = useState<{ uid: string; name: string } | null>(
    null
  );
  const [busy, setBusy] = useState<string | null>(null);
  const write = async (
    uid: string,
    time: { from: number; until: number } | null
  ) => {
    if (!edit) return;
    await setHeldStudentTime(
      edit.teacherUid,
      edit.assignmentId,
      edit.hold,
      uid,
      time
    );
  };
  const remove = async (uid: string, name: string) => {
    const ok = await showConfirm(`${name} loses access to this quiz.`, {
      title: 'Remove scheduled time',
      variant: 'warning',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusy(uid);
    try {
      await write(uid, null);
    } catch (err) {
      logError('HeldStudents.remove', err);
      onError?.('Could not remove the time. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const current = editing
    ? students.find((s) => s.uid === editing.uid)
    : undefined;
  return (
    <>
      {editing && edit && (
        <SetStudentTimeDialog
          studentName={editing.name}
          current={
            current?.from != null
              ? { from: current.from, until: current.until }
              : null
          }
          dueAt={edit.dueAt}
          onClose={() => setEditing(null)}
          onSave={async (time) => {
            try {
              await write(editing.uid, time);
            } catch (err) {
              logError('HeldStudents.edit', err);
              onError?.('Could not save the time. Try again.');
              throw err;
            }
          }}
        />
      )}
      <ul className="divide-y divide-slate-200" style={{ fontSize }}>
        {heldRows(students, names).map((r) => (
          <li
            key={r.uid}
            className={
              rowColumns
                ? 'grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)] items-baseline [@container(max-width:600px)]:grid-cols-1'
                : 'flex flex-col'
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
              className="flex flex-wrap items-center justify-between"
              style={{ columnGap: '0.75em', rowGap: '0.15em' }}
            >
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
              {edit && (
                <span className="inline-flex" style={{ gap: '0.9em' }}>
                  {/* no-tour-anchor: rows exist only for real scheduled students, so no tour can count on one */}
                  <button
                    type="button"
                    disabled={busy === r.uid}
                    onClick={() => setEditing({ uid: r.uid, name: r.name })}
                    aria-label={`Edit the time for ${r.name}`}
                    className={LINK}
                  >
                    Edit
                  </button>
                  {/* no-tour-anchor: rows exist only for real scheduled students, so no tour can count on one */}
                  <button
                    type="button"
                    disabled={busy === r.uid}
                    onClick={() => void remove(r.uid, r.name)}
                    aria-label={`Remove the time for ${r.name}`}
                    className={`${LINK} !text-brand-red-primary`}
                  >
                    Remove
                  </button>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
};

/** The Assigned row's always-visible list of students scheduled for later. */
export const AssignedHeldStudents: React.FC<{
  assignmentId: string;
  classIds?: string[];
  students: readonly HeldStudent[];
  edit?: HeldStudentEditTarget | null;
  onError?: (message: string) => void;
}> = ({ assignmentId, classIds, students, edit, onError }) => {
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
        edit={edit}
        onError={onError}
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
  edit?: HeldStudentEditTarget | null;
  onError?: (message: string) => void;
  onClose: () => void;
}> = ({ classLabel, students, names, accent, edit, onError, onClose }) => (
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
      <HeldStudentsList
        students={students}
        names={names}
        edit={edit}
        onError={onError}
      />
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
  edit?: HeldStudentEditTarget | null;
  onError?: (message: string) => void;
  onClose: () => void;
}> = ({ assignmentId, classIds, ...rest }) => {
  const names = useHeldStudentNames(assignmentId, classIds, true);
  return <HeldStudentsDialog names={names} {...rest} />;
};
