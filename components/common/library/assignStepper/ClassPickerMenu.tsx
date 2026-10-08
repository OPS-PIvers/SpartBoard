import React, { useId } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import type { ClassRoster } from '@/types';
import {
  formatClassesValue,
  withClassIds,
  type AssignClassesValue,
} from './assignClassesValue';
import { usePickMenu } from './usePickMenu';

export interface ClassPickerMenuProps {
  rosters: ClassRoster[];
  value: AssignClassesValue;
  onChange: (next: AssignClassesValue) => void;
  /** One class at most (Video Activity live). */
  singleSelect?: boolean;
  disabled?: boolean;
}

/** Classes as a select-style button that opens a checklist menu (D5). */
export const ClassPickerMenu: React.FC<ClassPickerMenuProps> = ({
  rosters,
  value,
  onChange,
  singleSelect = false,
  disabled = false,
}) => {
  const { open, setOpen, rootRef, onKeyDown } = usePickMenu();
  const menuId = useId();

  const toggle = (id: string) => {
    if (singleSelect) {
      onChange(withClassIds(value, [id]));
      setOpen(false);
      return;
    }
    const next = value.classIds.includes(id)
      ? value.classIds.filter((x) => x !== id)
      : rosters
          .map((r) => r.id)
          .filter((rid) => rid === id || value.classIds.includes(rid));
    onChange(withClassIds(value, next));
  };

  const selectAll = () =>
    onChange(
      withClassIds(
        value,
        rosters.filter((r) => !r.loadError).map((r) => r.id)
      )
    );

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 hover:border-slate-400 focus:outline-none focus:border-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Users className="w-4 h-4 shrink-0 text-slate-500" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">
          {formatClassesValue(value, rosters)}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          {rosters.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-slate-500">
              No classes yet. Create one in My Classes or import from ClassLink
              to assign here.
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {rosters.map((r) => {
                const unavailable = Boolean(r.loadError);
                return (
                  <label
                    key={r.id}
                    title={unavailable ? r.loadError : undefined}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      unavailable
                        ? 'cursor-not-allowed text-slate-400'
                        : 'cursor-pointer text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type={singleSelect ? 'radio' : 'checkbox'}
                      name={singleSelect ? menuId : undefined}
                      checked={value.classIds.includes(r.id)}
                      disabled={unavailable}
                      onChange={() => toggle(r.id)}
                      className="h-4 w-4 rounded accent-brand-blue-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="text-xs text-slate-400">
                      {unavailable ? 'Unavailable' : r.studentCount}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {!singleSelect && rosters.length > 0 && (
            <div className="mt-1 flex justify-between border-t border-slate-100 px-2 pb-0.5 pt-1.5">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-bold text-brand-blue-primary hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange(withClassIds(value, []))}
                className="text-xs font-bold text-slate-500 hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
