import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Btn } from '@/components/admin/Organization/components/primitives';
import { SECTION } from '@/components/gradebook/settings/GradebookSettingsEditor';
import { ChecklistSelect } from '@/components/gradebook/settings/ChecklistSelect';
import type { UndoEntry } from '@/components/gradebook/settings/useUndoToast';
import { canonicalizeBuildingIds } from '@/config/buildings';
import type { GradingPeriod } from '@/utils/gradebook/gradebookCore';
import {
  DATE_RE,
  PERIOD_PRESETS,
  type GradingPeriodSet,
} from '@/utils/gradebook/gradingPeriods';

type SetBody = Pick<GradingPeriodSet, 'name' | 'buildingIds' | 'periods'>;

export interface GradingPeriodSetsCardProps {
  sets: GradingPeriodSet[];
  buildings: { id: string; name: string }[];
  newId: () => string;
  onSave: (id: string, set: SetBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  notify: (message: string, undo?: UndoEntry) => void;
  fail: (err: unknown) => void;
}

const FIELD =
  'h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30';
const ICON_BTN =
  'h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand-red-primary focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30';

const bodyOf = (s: GradingPeriodSet): SetBody => ({
  name: s.name,
  buildingIds: [...s.buildingIds],
  periods: s.periods.map((p) => ({ ...p })),
});

const periodId = () =>
  `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Commits on blur or Enter; resets when the stored value changes. */
const Commit: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> & {
    value: string;
    onCommit: (v: string) => void;
  }
> = ({ value, onCommit, className = '', ...rest }) => (
  <input
    key={value}
    defaultValue={value}
    className={`${FIELD} ${className}`}
    onBlur={(e) => {
      if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter') e.currentTarget.blur();
    }}
    {...rest}
  />
);

/** D18 grading period sets, each targeted to one or more buildings. */
export const GradingPeriodSetsCard: React.FC<GradingPeriodSetsCardProps> = ({
  sets,
  buildings,
  newId,
  onSave,
  onDelete,
  notify,
  fail,
}) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const save = (set: GradingPeriodSet, next: SetBody, message: string) => {
    const prev = bodyOf(set);
    onSave(set.id, next).catch(fail);
    notify(message, { run: () => onSave(set.id, prev) });
  };

  const setPeriod = (
    set: GradingPeriodSet,
    i: number,
    patch: Partial<GradingPeriod>,
    message: string
  ) => {
    const periods = set.periods.map((p, n) =>
      n === i ? { ...p, ...patch } : p
    );
    const p = periods[i];
    if (p.start && p.end && p.end < p.start) {
      notify('The end date is before the start date.');
      return;
    }
    save(set, { ...bodyOf(set), periods }, message);
  };

  const toggleBuilding = (set: GradingPeriodSet, id: string, on: boolean) => {
    const name = buildings.find((b) => b.id === id)?.name ?? 'Building';
    const mine = canonicalizeBuildingIds(set.buildingIds);
    if (!on) {
      save(
        set,
        { ...bodyOf(set), buildingIds: mine.filter((b) => b !== id) },
        `${name} no longer uses ${set.name}`
      );
      return;
    }
    const other = sets.find(
      (s) =>
        s.id !== set.id && canonicalizeBuildingIds(s.buildingIds).includes(id)
    );
    const next = { ...bodyOf(set), buildingIds: [...mine, id] };
    const prevOther = other ? bodyOf(other) : null;
    const prevSet = bodyOf(set);
    onSave(set.id, next).catch(fail);
    if (other)
      onSave(other.id, {
        ...bodyOf(other),
        buildingIds: canonicalizeBuildingIds(other.buildingIds).filter(
          (b) => b !== id
        ),
      }).catch(fail);
    notify(
      other
        ? `Moved ${name} from ${other.name} to ${set.name}`
        : `${name} now uses ${set.name}`,
      {
        run: async () => {
          await onSave(set.id, prevSet);
          if (other && prevOther) await onSave(other.id, prevOther);
        },
      }
    );
  };

  const create = () => {
    const id = newId();
    onSave(id, {
      name: sets.length
        ? `Grading periods ${sets.length + 1}`
        : 'Grading periods',
      buildingIds: [],
      periods: [],
    }).catch(fail);
    notify('Created a period set', { run: () => onDelete(id) });
  };

  const remove = (set: GradingPeriodSet) => {
    const prev = bodyOf(set);
    setConfirmId(null);
    onDelete(set.id).catch(fail);
    notify(`Deleted ${set.name}`, { run: () => onSave(set.id, prev) });
  };

  return (
    <section className={SECTION} aria-labelledby="gb-admin-periods">
      <div className="flex items-center gap-2">
        <h3 id="gb-admin-periods" className="text-sm font-bold text-slate-800">
          Grading periods
        </h3>
        <span className="flex-1" />
        <Btn size="sm" onClick={create}>
          + New period set
        </Btn>
      </div>
      {sets.length === 0 && (
        <p className="text-sm text-slate-500">No grading periods</p>
      )}
      {sets.map((set) => {
        const onBuildings = canonicalizeBuildingIds(set.buildingIds);
        return (
          <div
            key={set.id}
            className="flex flex-col gap-2.5 rounded-lg border border-slate-200 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Commit
                value={set.name}
                maxLength={80}
                aria-label="Period set name"
                className="w-[220px] font-semibold"
                onCommit={(raw) => {
                  const name = raw.trim().slice(0, 80);
                  if (name)
                    save(set, { ...bodyOf(set), name }, `Renamed to ${name}`);
                }}
              />
              <ChecklistSelect
                label={`Buildings using ${set.name}`}
                emptyText="No buildings"
                className="flex-1 max-w-[320px]"
                options={buildings.map((b) => {
                  const other = sets.find(
                    (s) =>
                      s.id !== set.id &&
                      canonicalizeBuildingIds(s.buildingIds).includes(b.id)
                  );
                  return { id: b.id, label: b.name, note: other?.name };
                })}
                selected={onBuildings}
                onToggle={(id, on) => toggleBuilding(set, id, on)}
              />
              <button
                type="button"
                className={ICON_BTN}
                title="Delete"
                aria-label={`Delete ${set.name}`}
                onClick={() => setConfirmId(set.id)}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>

            {confirmId === set.id && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
                <span className="flex-1">
                  Delete <b>{set.name}</b>?
                </span>
                <Btn variant="danger" size="sm" onClick={() => remove(set)}>
                  Delete
                </Btn>
                <Btn size="sm" onClick={() => setConfirmId(null)}>
                  Cancel
                </Btn>
              </div>
            )}

            {set.periods.length > 0 && (
              <table className="w-full max-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-1 py-1 w-[110px]">Period</th>
                    <th className="px-1 py-1">Starts</th>
                    <th className="px-1 py-1">Ends</th>
                    <th className="w-9">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {set.periods.map((p, i) => (
                    <tr key={p.id}>
                      <td className="px-1 py-1">
                        <Commit
                          value={p.label}
                          maxLength={20}
                          aria-label="Period name"
                          className="w-full"
                          onCommit={(raw) => {
                            const label = raw.trim().slice(0, 20);
                            if (label)
                              setPeriod(
                                set,
                                i,
                                { label },
                                `Renamed to ${label}`
                              );
                          }}
                        />
                      </td>
                      {(['start', 'end'] as const).map((k) => (
                        <td key={k} className="px-1 py-1">
                          <Commit
                            type="date"
                            value={p[k]}
                            aria-label={`${p.label} ${k === 'start' ? 'start' : 'end'} date`}
                            className="w-full"
                            onCommit={(raw) => {
                              if (raw && !DATE_RE.test(raw)) return;
                              setPeriod(
                                set,
                                i,
                                { [k]: raw },
                                `Changed ${p.label} dates`
                              );
                            }}
                          />
                        </td>
                      ))}
                      <td className="py-1">
                        <button
                          type="button"
                          className={ICON_BTN}
                          title="Remove period"
                          aria-label={`Remove ${p.label}`}
                          onClick={() =>
                            save(
                              set,
                              {
                                ...bodyOf(set),
                                periods: set.periods.filter((_, n) => n !== i),
                              },
                              `Removed ${p.label}`
                            )
                          }
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={set.periods.length >= 12}
                className="text-xs font-semibold text-brand-blue-primary hover:underline disabled:opacity-50"
                onClick={() =>
                  save(
                    set,
                    {
                      ...bodyOf(set),
                      periods: [
                        ...set.periods,
                        {
                          id: periodId(),
                          label: `Period ${set.periods.length + 1}`,
                          start: '',
                          end: '',
                        },
                      ],
                    },
                    'Added a period'
                  )
                }
              >
                + Add period
              </button>
              {set.periods.length === 0 &&
                (['quarters', 'semesters'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="text-xs font-semibold text-brand-blue-primary hover:underline"
                    onClick={() =>
                      save(
                        set,
                        {
                          ...bodyOf(set),
                          periods: PERIOD_PRESETS[k].map((label) => ({
                            id: periodId(),
                            label,
                            start: '',
                            end: '',
                          })),
                        },
                        k === 'quarters' ? 'Added quarters' : 'Added semesters'
                      )
                    }
                  >
                    + {k === 'quarters' ? 'Quarters' : 'Semesters'}
                  </button>
                ))}
            </div>
          </div>
        );
      })}
    </section>
  );
};
