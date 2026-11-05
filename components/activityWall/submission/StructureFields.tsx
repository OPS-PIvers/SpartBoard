import React from 'react';
import type { ActivityWallSection, ActivityWallSession } from '@/types';
import {
  EMPTY_DATE_FIELDS,
  MONTH_NAMES,
  daysInMonth,
  type WallDateFields,
  type WallDatePrecision,
} from '@/components/activityWall/render/timelineDates';

const selectClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1';

export interface StructureValue {
  sectionId: string;
  rowId: string;
  colId: string;
  label: string;
  /** Dated timelines only: the year/era/month/day pickers. */
  date: WallDateFields;
  /** Dated timelines only: the end of a range, or null for a single date. */
  endDate: WallDateFields | null;
}

interface StructureFieldsProps {
  session: ActivityWallSession;
  value: StructureValue;
  onChange: (patch: Partial<StructureValue>) => void;
  /** Shown under the date pickers once the student has typed a year. */
  dateError?: string;
  endDateError?: string;
}

const options = (items: ActivityWallSection[] | undefined) => items ?? [];

/** Year, era, accuracy, month and day pickers; an end date has no accuracy choice. */
const DateRows: React.FC<{
  idPrefix: string;
  fields: WallDateFields;
  error?: string;
  onChange: (patch: Partial<WallDateFields>) => void;
}> = ({ idPrefix, fields: date, error, onChange: setDate }) => {
  const isEnd = idPrefix !== 'aw';
  const errorId = `${idPrefix}-date-error`;
  const yearNumber = Number(date.year.replace(/,/g, '')) || 2000;
  const dayCount = date.month
    ? daysInMonth(
        date.era === 'BCE' ? -yearNumber : yearNumber,
        Number(date.month)
      )
    : 0;
  return (
    <>
      <div className={`grid gap-2 ${isEnd ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-year`}>
            Year
          </label>
          {/* no-tour-anchor: student post form, not part of any teacher tour */}
          <input
            id={`${idPrefix}-year`}
            className={selectClass}
            value={date.year}
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setDate({ year: event.target.value })}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-era`}>
            Era
          </label>
          {/* no-tour-anchor: student post form, not part of any teacher tour */}
          <select
            id={`${idPrefix}-era`}
            className={selectClass}
            value={date.era}
            onChange={(event) =>
              setDate(
                event.target.value === 'BCE'
                  ? {
                      era: 'BCE',
                      precision:
                        date.precision === 'decade' ? 'about' : date.precision,
                    }
                  : { era: 'CE' }
              )
            }
          >
            <option value="CE">CE</option>
            <option value="BCE">BCE</option>
          </select>
        </div>
        {!isEnd && (
          <div>
            <label className={labelClass} htmlFor={`${idPrefix}-precision`}>
              Accuracy
            </label>
            {/* no-tour-anchor: student post form, not part of any teacher tour */}
            <select
              id={`${idPrefix}-precision`}
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
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-month`}>
            Month
          </label>
          {/* no-tour-anchor: student post form, not part of any teacher tour */}
          <select
            id={`${idPrefix}-month`}
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
          <label className={labelClass} htmlFor={`${idPrefix}-day`}>
            Day
          </label>
          {/* no-tour-anchor: student post form, not part of any teacher tour */}
          <select
            id={`${idPrefix}-day`}
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
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      )}
    </>
  );
};

/** Layout-specific placement fields: column, table cell, or timeline label. */
export const StructureFields: React.FC<StructureFieldsProps> = ({
  session,
  value,
  onChange,
  dateError,
  endDateError,
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
    const { date, endDate } = value;
    const groups = options(session.timelineGroups);
    const inGroup = groups.some((group) => group.id === value.sectionId);
    return (
      <div className="space-y-3">
        {groups.length > 0 && (
          <div>
            <label className={labelClass} htmlFor="aw-group">
              Group
            </label>
            {/* no-tour-anchor: student post form, not part of any teacher tour */}
            <select
              id="aw-group"
              className={selectClass}
              value={inGroup ? value.sectionId : ''}
              onChange={(event) => onChange({ sectionId: event.target.value })}
            >
              {!inGroup && <option value="">No group</option>}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <fieldset>
          <legend className="sr-only">Date</legend>
          <DateRows
            idPrefix="aw"
            fields={date}
            error={dateError}
            onChange={(patch) => {
              const next = { ...date, ...patch };
              // Only an exact date can start a range.
              onChange(
                next.precision === 'exact'
                  ? { date: next }
                  : { date: next, endDate: null }
              );
            }}
          />
        </fieldset>
        {endDate ? (
          <fieldset>
            <legend className={labelClass}>End date</legend>
            <DateRows
              idPrefix="aw-end"
              fields={endDate}
              error={endDateError}
              onChange={(patch) =>
                onChange({ endDate: { ...endDate, ...patch } })
              }
            />
            {/* no-tour-anchor: student post form, not part of any teacher tour */}
            <button
              type="button"
              className="mt-1 text-sm font-semibold text-slate-600 underline-offset-2 hover:underline"
              onClick={() => onChange({ endDate: null })}
            >
              Remove end date
            </button>
          </fieldset>
        ) : (
          date.precision === 'exact' && (
            // no-tour-anchor: student post form, not part of any teacher tour
            <button
              type="button"
              className="text-sm font-semibold text-brand-blue-primary underline-offset-2 hover:underline"
              onClick={() =>
                onChange({
                  endDate: { ...EMPTY_DATE_FIELDS, era: date.era },
                })
              }
            >
              Add end date
            </button>
          )
        )}
      </div>
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
