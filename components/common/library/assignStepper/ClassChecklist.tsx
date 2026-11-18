import React, { useId } from 'react';
import type { ClassRoster } from '@/types';
import { withClassIds, type AssignClassesValue } from './assignClassesValue';
import {
  tourAttr,
  tourFieldAttr,
  type TourAnchorAttrs,
} from '@/config/tourAnchors';

export interface ClassChecklistProps {
  rosters: ClassRoster[];
  value: AssignClassesValue;
  onChange: (next: AssignClassesValue) => void;
  /** One class at most (Video Activity live). */
  singleSelect?: boolean;
  disabled?: boolean;
  /** Live-tour anchor for the list. */
  anchor?: TourAnchorAttrs;
  /** Live-tour anchor for one class's checkbox, keyed by class id. */
  rowAnchor?: (classId: string, rowIndex: number) => TourAnchorAttrs;
}

/** Classes as an inline checklist that scrolls after about six rows. */
export const ClassChecklist: React.FC<ClassChecklistProps> = ({
  rosters,
  value,
  onChange,
  singleSelect = false,
  disabled = false,
  anchor,
  rowAnchor,
}) => {
  const groupName = useId();

  const toggle = (id: string) => {
    if (singleSelect) {
      onChange(withClassIds(value, [id]));
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
    <div
      role={singleSelect ? 'radiogroup' : 'group'}
      aria-label="Classes"
      {...(anchor ?? tourAttr('assign-classes.trigger'))}
      className={`rounded-lg border border-slate-300 bg-white ${disabled ? 'opacity-50' : ''}`}
    >
      {rosters.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-500">
          No classes yet. Create one in My Classes or import from ClassLink to
          assign here.
        </p>
      ) : (
        <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto custom-scrollbar">
          {rosters.map((r, rowIndex) => {
            const unavailable = Boolean(r.loadError);
            const off = unavailable || disabled;
            return (
              <label
                key={r.id}
                title={unavailable ? r.loadError : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm ${
                  unavailable
                    ? 'cursor-not-allowed text-slate-400'
                    : disabled
                      ? 'cursor-not-allowed text-slate-800'
                      : 'cursor-pointer text-slate-800 hover:bg-slate-50'
                }`}
              >
                <input
                  type={singleSelect ? 'radio' : 'checkbox'}
                  name={singleSelect ? groupName : undefined}
                  checked={value.classIds.includes(r.id)}
                  disabled={off}
                  onChange={() => toggle(r.id)}
                  {...(rowAnchor?.(r.id, rowIndex) ??
                    tourFieldAttr(
                      'assign-classes.option',
                      'assign',
                      `row-${rowIndex + 1}`
                    ))}
                  className="h-4 w-4 shrink-0 rounded-sm accent-brand-blue-primary"
                />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {unavailable ? 'Unavailable' : r.studentCount}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {!singleSelect && rosters.length > 1 && (
        <div className="flex justify-between border-t border-slate-200 px-3 py-1.5">
          <button
            type="button"
            onClick={selectAll}
            disabled={disabled}
            {...tourAttr('assign-classes.select-all')}
            className="text-xs font-bold text-brand-blue-primary hover:underline disabled:cursor-not-allowed disabled:no-underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange(withClassIds(value, []))}
            disabled={disabled}
            {...tourAttr('assign-classes.clear')}
            className="text-xs font-bold text-slate-500 hover:underline disabled:cursor-not-allowed disabled:no-underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
