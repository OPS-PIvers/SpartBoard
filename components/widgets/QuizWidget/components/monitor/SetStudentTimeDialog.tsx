import React, { useId, useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { tourAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { combineDateAndTime, getLocalIsoDate } from '@/utils/localDate';
import type { StudentTime } from './studentTimeFormat';

interface SetStudentTimeDialogProps {
  studentName: string;
  /** The time already set for this student, if any. */
  current: StudentTime | null;
  /** The quiz's due date; a time past it gets the Late line. */
  dueAt?: number | null;
  now: number;
  onClose: () => void;
  onSave: (time: StudentTime | null) => Promise<void>;
}

const FIVE_MIN = 5 * 60 * 1000;

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const toFields = (ms: number) => {
  const d = new Date(ms);
  return { day: getLocalIsoDate(d), time: hhmm(d) };
};

const TimeRow: React.FC<{
  label: string;
  value: { day: string; time: string };
  onChange: (next: { day: string; time: string }) => void;
  dateAnchor: TourAnchorAttrs;
  timeAnchor: TourAnchorAttrs;
}> = ({ label, value, onChange, dateAnchor, timeAnchor }) => {
  const id = useId();
  return (
    <div className="flex items-center gap-3 [container-type:inline-size]">
      <label
        htmlFor={id}
        className="w-16 shrink-0 text-sm font-semibold text-slate-700"
      >
        {label}
      </label>
      <div className="flex h-9 min-w-0 flex-1 items-stretch rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus-within:border-brand-blue-primary [@container(max-width:24rem)]:h-auto [@container(max-width:24rem)]:flex-col">
        <input
          id={id}
          type="date"
          required
          value={value.day}
          onChange={(e) => {
            if (e.target.value) onChange({ ...value, day: e.target.value });
          }}
          {...dateAnchor}
          className="h-9 min-w-0 flex-1 border-r border-slate-200 bg-transparent px-2.5 focus:outline-hidden [@container(max-width:24rem)]:flex-none [@container(max-width:24rem)]:border-r-0 [@container(max-width:24rem)]:border-b"
        />
        <input
          type="time"
          required
          aria-label={`${label} time`}
          value={value.time}
          onChange={(e) => {
            if (e.target.value) onChange({ ...value, time: e.target.value });
          }}
          {...timeAnchor}
          className="h-9 w-32 shrink-0 bg-transparent px-2.5 focus:outline-hidden [@container(max-width:24rem)]:w-full"
        />
      </div>
    </div>
  );
};

/** Sets when one student can take the quiz, apart from their class. */
export const SetStudentTimeDialog: React.FC<SetStudentTimeDialogProps> = ({
  studentName,
  current,
  dueAt,
  now,
  onClose,
  onSave,
}) => {
  const [opens, setOpens] = useState(() =>
    toFields(current?.from ?? Math.ceil(now / FIVE_MIN) * FIVE_MIN)
  );
  const [closes, setCloses] = useState(() =>
    toFields(
      current?.until ?? Math.ceil(now / FIVE_MIN) * FIVE_MIN + 60 * 60 * 1000
    )
  );
  const [busy, setBusy] = useState(false);

  const from = combineDateAndTime(opens.day, opens.time);
  const until = combineDateAndTime(closes.day, closes.time);
  const error =
    from == null || until == null
      ? 'Enter a date and time.'
      : until <= from
        ? 'Closes must be after Opens.'
        : until <= now
          ? 'Closes must be in the future.'
          : null;
  const late =
    !error && typeof dueAt === 'number' && until != null && until > dueAt;

  const run = async (time: StudentTime | null) => {
    setBusy(true);
    try {
      await onSave(time);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const button =
    'px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <Modal
      accent={LIBRARY_HEADER_ACCENTS.quiz}
      isOpen
      onClose={busy ? () => undefined : onClose}
      title={`Schedule ${studentName}`}
      zIndex="z-modal-deep"
      maxWidth="max-w-md"
      contentClassName="px-6 pb-4"
      footer={
        <div className="flex flex-wrap justify-center gap-2">
          {current && (
            <button
              type="button"
              onClick={() => void run(null)}
              disabled={busy}
              {...tourAttr('quiz-student-time.remove')}
              className={`${button} text-brand-red-primary hover:bg-red-50`}
            >
              Remove schedule
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            {...tourAttr('quiz-student-time.cancel')}
            className={`${button} border border-slate-200 text-slate-700 hover:bg-slate-50`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (from != null && until != null) void run({ from, until });
            }}
            disabled={!!error || busy}
            {...tourAttr('quiz-student-time.save')}
            className={`${button} bg-brand-blue-primary text-white hover:bg-brand-blue-dark`}
          >
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Only this student can get in at this time. Their class does not
          change.
        </p>
        <TimeRow
          label="Opens"
          value={opens}
          dateAnchor={tourAttr('quiz-student-time.opens-date')}
          timeAnchor={tourAttr('quiz-student-time.opens-time')}
          onChange={(next) => {
            setOpens(next);
            if (closes.day < next.day) setCloses({ ...closes, day: next.day });
          }}
        />
        <TimeRow
          label="Closes"
          value={closes}
          dateAnchor={tourAttr('quiz-student-time.closes-date')}
          timeAnchor={tourAttr('quiz-student-time.closes-time')}
          onChange={setCloses}
        />
        {error ? (
          <p
            role="alert"
            className="text-sm font-semibold text-brand-red-primary"
          >
            {error}
          </p>
        ) : (
          late && (
            <p className="text-sm text-amber-700">
              Work turned in after the due date shows as Late.
            </p>
          )
        )}
      </div>
    </Modal>
  );
};
