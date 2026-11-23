// Under the Assign dialog's class list: this item is already open for some of the teacher's classes.
import React, { useId } from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { listNames, type AssignOpenElsewhere } from './assignOpenCheck';

/** The add-to label names the open assignment's classes when there are one or two. */
const joinLabel = (names: readonly string[]): string =>
  names.length >= 1 && names.length <= 2
    ? `Add to the ${listNames(names)} assignment`
    : 'Add to the open assignment';

export const AssignOpenNotice: React.FC<{
  open: AssignOpenElsewhere;
  /** Any class picked that isn't open yet. */
  pickedNew: boolean;
}> = ({ open, pickedNew }) => {
  const group = useId();
  if (open.ids.size === 0) return null;
  const join = open.join;
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Already assigned to {listNames(open.names)}. Edit or close it in
        Assigned.
      </p>
      {join && pickedNew && (
        <div
          role="radiogroup"
          aria-label="Where these classes go"
          className="divide-y divide-slate-100 rounded-lg border border-slate-300 bg-white"
        >
          {(
            [
              [
                'join',
                joinLabel(join.targetNames),
                'Uses its settings.',
                tourAttr('assign-classes.add-to-open'),
              ],
              [
                'new',
                'Make a separate assignment',
                null,
                tourAttr('assign-classes.assign-separately'),
              ],
            ] as const
          ).map(([value, label, hint, anchor]) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
            >
              <input
                type="radio"
                name={group}
                checked={join.value === value}
                onChange={() => join.onChange(value)}
                {...anchor}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{label}</span>
                {hint && (
                  <span className="block text-xs text-slate-500">{hint}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
