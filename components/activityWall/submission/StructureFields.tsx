import React from 'react';
import type { ActivityWallSection, ActivityWallSession } from '@/types';

const selectClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1';

export interface StructureValue {
  sectionId: string;
  rowId: string;
  colId: string;
  label: string;
}

interface StructureFieldsProps {
  session: ActivityWallSession;
  value: StructureValue;
  onChange: (patch: Partial<StructureValue>) => void;
}

const options = (items: ActivityWallSection[] | undefined) => items ?? [];

/** Layout-specific placement fields: column, table cell, or timeline label. */
export const StructureFields: React.FC<StructureFieldsProps> = ({
  session,
  value,
  onChange,
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
