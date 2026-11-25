// Assignments hub filter: a checklist menu for several picks, a native select for one.

import React from 'react';
import { ChecklistSelect } from '@/components/common/ChecklistSelect';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

export interface AssignmentFilterOption {
  value: string;
  label: string;
}

interface AssignmentFilterSelectProps {
  /** Accessible name for the trigger, e.g. "Filter by type". */
  label: string;
  /** Visible trigger text — the caller formats the active selection. */
  summary: string;
  options: AssignmentFilterOption[];
  /** Empty means "no filter". */
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
  multiple?: boolean;
  anchor?: TourAnchorAttrs;
}

const fieldClass = (filtered: boolean) =>
  `w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/30 ${
    filtered
      ? 'border-brand-blue-primary/40 bg-brand-blue-lighter/30 text-brand-blue-primary'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
  }`;

export const AssignmentFilterSelect: React.FC<AssignmentFilterSelectProps> = ({
  label,
  summary,
  options,
  selected,
  onChange,
  allLabel,
  multiple = false,
  anchor,
}) => {
  const filtered = selected.length > 0;
  if (!multiple)
    return (
      <select
        {...anchor}
        aria-label={label}
        value={selected[0] ?? ''}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
        className={fieldClass(filtered)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  return (
    <ChecklistSelect
      label={label}
      summary={summary}
      options={options.map((o) => ({ id: o.value, label: o.label }))}
      selected={selected}
      onToggle={(id, checked) =>
        onChange(checked ? [...selected, id] : selected.filter((v) => v !== id))
      }
      emptyText={allLabel}
      anchor={anchor}
      triggerClassName={`flex items-center gap-1.5 text-left ${fieldClass(filtered)}`}
    />
  );
};
