import React from 'react';
import type { ActivityWallSection, ActivityWallSession } from '@/types';
import {
  MONTH_NAMES,
  daysInMonth,
  type WallDateFields,
  type WallDatePrecision,
} from '@/components/activityWall/render/timelineDates';

const selectClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1';

export interface StructureValue {
  sectionId: string;
  rowId: string;
  colId: string;
  label: string;
  /** Dated timelines only: the year/era/month/day pickers. */
  date: WallDateFields;
}

interface StructureFieldsProps {
  session: ActivityWallSession;
  value: StructureValue;
  onChange: (patch: Partial<StructureValue>) => void;
  /** Shown under the date pickers once the student has typed a year. */
  dateError?: string;
}

const options = (items: ActivityWallSection[] | undefined) => items ?? [];

/** Layout-specific placement fields: column, table cell, or timeline label. */
export const StructureFields: React.FC<StructureFieldsProps> = ({
  session,
  value,
  onChange,
  dateError,
}) => {
  if (session.layout === 'columns') {
    const sections = options(session.sections);
    if (sections.length === 0) return null;
    return (
      <div>
        <label className={labelClass} htmlFor="aw-section">
          Column
        </label>
        <select
          id="aw-section"
          className={selectClass}
          value={value.sectionId}
          onChange={(event) => onChange({ sectionId: event.target.value })}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (session.layout === 'table') {
    const rows = options(session.tableRows);
    const cols = options(session.tableCols);
    if (rows.length === 0 || cols.length === 0) return null;
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="aw-row">
            Row
          </label>
          <select
            id="aw-row"
            className={selectClass}
            value={value.rowId}
            onChange={(event) => onChange({ rowId: event.target.value })}
          >
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="aw-col">
            Column
          </label>
          <select
            id="aw-col"
            className={selectClass}
            value={value.colId}
            onChange={(event) => onChange({ colId: event.target.value })}
          >
            {cols.map((col) => (
              <option key={col.id} value={col.id}>
                {col.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (session.layout === 'timeline' && session.timelineDates) {
    const { date } = value;
    const setDate = (patch: Partial<WallDateFields>) =>
      onChange({ date: { ...date, ...patch } });
    const yearNumber = Number(date.year.replace(/,/g, '')) || 2000;
    const dayCount = date.month
      ? daysInMonth(
          date.era === 'BCE' ? -yearNumber : yearNumber,
          Number(date.month)
        )
      : 0;
    return (
      <fieldset>
        <legend className="sr-only">Date</legend>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelClass} htmlFor="aw-year">
              Year
            </label>
            {/* no-tour-anchor: student post form, not part of any teacher tour */}
            <input
              id="aw-year"
              className={selectClass}
              value={date.year}
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? 'aw-date-error' : undefined}
              onChange={(event) => setDate({ year: event.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="aw-era">
              Era
            </label>
            {/* no-tour-anchor: student post form, not part of any teacher tour */}
            <select
              id="aw-era"
              className={selectClass}
              value={date.era}
              onChange={(event) =>
                setDate(
                  event.target.value === 'BCE'
                    ? {
                        era: 'BCE',
                        precision:
                          date.precision === 'decade'
                            ? 'about'
                            : date.precision,
                      }
                    : { era: 'CE' }
                )
              }
            >
              <option value="CE">CE</option>
              <option value="BCE">BCE</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="aw-precision">
              Accuracy
            </label>
            {/* no-tour-anchor: student post form, not part of any teacher tour */}
            <select
              id="aw-precision"
              className={selectClass}
              value={date.precision}
              onChange={(event) => {
                const precision = event.target.value as WallDatePrecision;
                setDate(
                  precision === 'exact'
                    ? { precision }
                    : { precision, month: '', day: '' }
                );
              }}
            >
              <option value="exact">Exact</option>
              <option value="about">About</option>
              <option value="decade" disabled={date.era === 'BCE'}>
                Decade
              </option>
              <option value="century">Century</option>
            </select>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass} htmlFor="aw-month">
              Month
            </label>
            {/* no-tour-anchor: student post form, not part of any teacher tour */}
            <select
              id="aw-month"
              className={selectClass}
              value={date.month}
              disabled={date.precision !== 'exact'}
              onChange={(event) =>
                setDate({
                  month: event.target.value,
                  day: event.target.value ? date.day : '',
                })
              }
            >
              <option value="">Any</option>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="aw-day">
              Day
            </label>
            {/* no-tour-anchor: student post form, not part of any teacher tour */}
            <select
              id="aw-day"
              className={selectClass}
              value={date.day}
              disabled={!date.month || date.precision !== 'exact'}
              onChange={(event) => setDate({ day: event.target.value })}
            >
              <option value="">Any</option>
              {Array.from(
                { length: Math.max(dayCount, Number(date.day) || 0) },
                (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {i + 1}
                  </option>
                )
              )}
            </select>
          </div>
        </div>
        {dateError && (
          <p
            id="aw-date-error"
            role="alert"
            className="mt-1 text-sm font-medium text-red-700"
          >
            {dateError}
          </p>
        )}
      </fieldset>
    );
  }

  if (session.layout === 'timeline') {
    return (
      <div>
        <label className={labelClass} htmlFor="aw-label">
          When (label)
        </label>
        <input
          id="aw-label"
          className={selectClass}
          value={value.label}
          maxLength={60}
          placeholder="e.g. Early 1800s"
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </div>
    );
  }

  return null;
};
