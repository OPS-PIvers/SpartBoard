import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourAttr } from '@/config/tourAnchors';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';

export type ReopenStudentStatus =
  'not-started' | 'absent' | 'in-progress' | 'turned-in' | 'on-paper';

export interface ReopenStudentOption {
  key: string;
  name: string;
  className: string;
  status: ReopenStudentStatus;
}

interface ReopenStudentsDialogProps {
  isOpen: boolean;
  title: string;
  students: readonly ReopenStudentOption[];
  onClose: () => void;
  onConfirm: (keys: string[]) => Promise<void>;
}

const STATUS_LABEL: Record<ReopenStudentStatus, string> = {
  'not-started': 'Not started',
  absent: 'Absent',
  'in-progress': 'In progress',
  'turned-in': 'Submitted',
  'on-paper': 'On paper',
};

const byName = (a: ReopenStudentOption, b: ReopenStudentOption) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Picks students to reopen an ended quiz for, missing students first. */
export const ReopenStudentsDialog: React.FC<ReopenStudentsDialogProps> = ({
  isOpen,
  title,
  students,
  onClose,
  onConfirm,
}) => {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const shown = students.filter(
      (s) =>
        !needle ||
        s.name.toLowerCase().includes(needle) ||
        s.className.toLowerCase().includes(needle)
    );
    return [
      {
        id: 'open',
        label: 'Missing',
        rows: shown
          .filter((s) => s.status !== 'turned-in' && s.status !== 'on-paper')
          .sort(byName),
      },
      {
        id: 'paper',
        label: 'On paper',
        rows: shown.filter((s) => s.status === 'on-paper').sort(byName),
      },
      {
        id: 'done',
        label: 'Submitted',
        rows: shown.filter((s) => s.status === 'turned-in').sort(byName),
      },
    ].filter((g) => g.rows.length > 0);
  }, [students, needle]);

  const toggle = (keys: readonly string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const count = picked.size;
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm([...picked]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      accent={LIBRARY_HEADER_ACCENTS.quiz}
      isOpen={isOpen}
      onClose={busy ? () => undefined : onClose}
      title={title}
      zIndex="z-modal-deep"
      maxWidth="max-w-lg"
      className="max-h-[85vh]"
      contentClassName="px-6 pb-2 flex flex-col min-h-0"
      footer={
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            {...tourAttr('quiz-reopen-students.cancel')}
            className="px-5 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={count === 0 || busy}
            {...tourAttr('quiz-reopen-students.confirm')}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-brand-blue-primary text-white hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {count === 0
              ? 'Reopen'
              : `Reopen for ${count} student${count === 1 ? '' : 's'}`}
          </button>
        </div>
      }
    >
      <label className="relative block shrink-0">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students"
          aria-label="Search students"
          {...tourAttr('quiz-reopen-students.search')}
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
        />
      </label>
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto pb-4">
        {groups.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            No students match.
          </p>
        )}
        {groups.map((g) => {
          const keys = g.rows.map((r) => r.key);
          const all = keys.every((k) => picked.has(k));
          return (
            <section key={g.id} className="mt-2 first:mt-0">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {g.label} · {g.rows.length}
                </h3>
                <button
                  type="button"
                  onClick={() => toggle(keys, !all)}
                  {...tourAttr('quiz-reopen-students.select-group')}
                  className="text-xs font-semibold text-brand-blue-primary hover:underline"
                >
                  {all ? 'Clear' : 'Select all'}
                </button>
              </div>
              <ul>
                {g.rows.map((s) => (
                  <li key={s.key}>
                    <label className="flex items-center gap-3 py-2 border-b border-slate-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={picked.has(s.key)}
                        onChange={(e) => toggle([s.key], e.target.checked)}
                        // no-tour-anchor: one row per student, the group's Select all is the tour target
                        className="w-4 h-4 accent-brand-blue-primary shrink-0"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">
                          {s.name}
                        </span>
                        {s.className && (
                          <span className="block text-xs text-slate-500 truncate">
                            {s.className}
                          </span>
                        )}
                      </span>
                      <span
                        className={`text-xs shrink-0 ${
                          s.status === 'absent'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {STATUS_LABEL[s.status]}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
};
