import React, { useId, useState } from 'react';
import { ChevronDown, Search, User, Users } from 'lucide-react';
import type { ClassRoster, StudentTargetRef } from '@/types';
import { studentTargetRefKey } from '@/utils/studentTargetRef';
import {
  studentCountLabel,
  withClassStudents,
  type AssignClassesValue,
} from './assignClassesValue';
import { usePickMenu } from './usePickMenu';
import {
  isTargetableRow,
  rosterGroupMembers,
  useRosterStudentRows,
} from './useRosterStudentRows';

const NO_SIGN_IN_TITLE = 'Individual assignment needs a school sign-in';

export interface StudentPickMenuProps {
  rosters: ClassRoster[];
  value: AssignClassesValue;
  onChange: (next: AssignClassesValue) => void;
}

/** Under the class picker, one "All students" menu per picked class (D5a). */
export const StudentPickMenu: React.FC<StudentPickMenuProps> = ({
  rosters,
  value,
  onChange,
}) => {
  const picked = rosters.filter((r) => value.classIds.includes(r.id));
  if (picked.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {picked.map((roster) => (
        <ClassStudentRow
          key={roster.id}
          roster={roster}
          refs={value.studentsByClass[roster.id] ?? null}
          onChange={(refs) =>
            onChange(withClassStudents(value, roster.id, refs))
          }
        />
      ))}
    </div>
  );
};

const ClassStudentRow: React.FC<{
  roster: ClassRoster;
  refs: StudentTargetRef[] | null;
  onChange: (refs: StudentTargetRef[] | null) => void;
}> = ({ roster, refs, onChange }) => {
  const { open, setOpen, rootRef, onKeyDown } = usePickMenu();
  const menuId = useId();
  const narrowed = !!refs && refs.length > 0;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate text-sm text-slate-700">
        {roster.name}
      </span>
      <div
        ref={rootRef}
        className="relative w-44 shrink-0"
        onKeyDown={onKeyDown}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`${roster.name}: ${narrowed ? studentCountLabel(refs.length) : 'All students'}`}
          className={`flex h-8 w-full items-center gap-2 rounded-lg border px-2.5 text-sm hover:border-slate-400 ${
            narrowed
              ? 'border-brand-blue-primary/50 bg-brand-blue-lighter/40 font-semibold text-brand-blue-dark'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
        >
          <User className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">
            {narrowed ? studentCountLabel(refs.length) : 'All students'}
          </span>
          <ChevronDown
            className="w-3.5 h-3.5 shrink-0 text-slate-400"
            aria-hidden
          />
        </button>
        {open && (
          <StudentMenu
            id={menuId}
            roster={roster}
            refs={refs ?? []}
            onChange={onChange}
            onAllStudents={() => {
              onChange(null);
              setOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

const StudentMenu: React.FC<{
  id: string;
  roster: ClassRoster;
  refs: StudentTargetRef[];
  onChange: (refs: StudentTargetRef[] | null) => void;
  onAllStudents: () => void;
}> = ({ id, roster, refs, onChange, onAllStudents }) => {
  const [search, setSearch] = useState('');
  const rows = useRosterStudentRows(roster, search);
  const pickedKeys = new Set(refs.map(studentTargetRefKey));
  const groups = roster.groups ?? [];

  const toggleStudent = (ref: StudentTargetRef) => {
    const key = studentTargetRefKey(ref);
    onChange(
      pickedKeys.has(key)
        ? refs.filter((r) => studentTargetRefKey(r) !== key)
        : [...refs, ref]
    );
  };

  return (
    <div
      id={id}
      role="dialog"
      aria-label={roster.name}
      className="absolute right-0 top-full z-10 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
    >
      <div className="m-1 flex h-8 items-center gap-2 rounded-lg border border-slate-200 px-2">
        <Search className="w-3.5 h-3.5 text-slate-400" aria-hidden />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search students"
          aria-label="Search students"
          className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
        />
      </div>
      {groups.length > 0 && (
        <>
          <div className="px-2 pt-1.5 pb-0.5 text-xxs font-bold uppercase tracking-widest text-slate-400">
            Groups
          </div>
          {groups.map((group) => {
            const { targetable } = rosterGroupMembers(roster, group);
            const added =
              targetable.length > 0 &&
              targetable.every((m) =>
                pickedKeys.has(studentTargetRefKey(m.ref))
              );
            return (
              <button
                key={group.id}
                type="button"
                disabled={targetable.length === 0}
                title={targetable.length === 0 ? NO_SIGN_IN_TITLE : undefined}
                aria-pressed={added}
                onClick={() => {
                  if (added) {
                    const drop = new Set(
                      targetable.map((m) => studentTargetRefKey(m.ref))
                    );
                    onChange(
                      refs.filter((r) => !drop.has(studentTargetRefKey(r)))
                    );
                  } else {
                    onChange([
                      ...refs,
                      ...targetable
                        .filter(
                          (m) => !pickedKeys.has(studentTargetRefKey(m.ref))
                        )
                        .map((m) => m.ref),
                    ]);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Users
                  className="w-4 h-4 text-brand-blue-primary"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                  {group.name}
                </span>
                <span
                  className={`text-xs ${added ? 'font-bold text-brand-blue-primary' : 'text-slate-400'}`}
                >
                  {added ? 'Added' : targetable.length}
                </span>
              </button>
            );
          })}
        </>
      )}
      <div className="px-2 pt-2 pb-0.5 text-xxs font-bold uppercase tracking-widest text-slate-400">
        Students
      </div>
      <div className="max-h-48 overflow-y-auto custom-scrollbar">
        {rows.map((row) =>
          isTargetableRow(row) ? (
            <label
              key={row.studentId}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={pickedKeys.has(studentTargetRefKey(row.ref))}
                onChange={() => toggleStudent(row.ref)}
                className="h-4 w-4 rounded accent-brand-blue-primary"
              />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
            </label>
          ) : (
            <label
              key={row.studentId}
              title={NO_SIGN_IN_TITLE}
              className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-400"
            >
              <input
                type="checkbox"
                disabled
                checked={false}
                className="h-4 w-4 rounded accent-brand-blue-primary"
              />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="text-xs">No sign-in</span>
            </label>
          )
        )}
        {rows.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-slate-400">
            {search.trim() ? 'No matches' : 'No students'}
          </p>
        )}
      </div>
      <div className="mt-1 flex justify-between border-t border-slate-100 px-2 pb-0.5 pt-1.5">
        <button
          type="button"
          onClick={onAllStudents}
          className="text-xs font-bold text-brand-blue-primary hover:underline"
        >
          All students
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs font-bold text-slate-500 hover:underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
};
