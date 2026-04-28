import React from 'react';

export type AssignmentFilterMode = 'all' | 'active' | 'completed';

interface AssignmentFilterTabsProps {
  value: AssignmentFilterMode;
  onChange: (mode: AssignmentFilterMode) => void;
  counts?: {
    all?: number;
    active?: number;
    completed?: number;
  };
}

const TABS: ReadonlyArray<{ id: AssignmentFilterMode; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
];

export const AssignmentFilterTabs: React.FC<AssignmentFilterTabsProps> = ({
  value,
  onChange,
  counts,
}) => (
  <div
    role="tablist"
    aria-label="Filter assignments"
    className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 p-1 shadow-sm"
  >
    {TABS.map((tab) => {
      const isActive = tab.id === value;
      const count = counts?.[tab.id];
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(tab.id)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1 ${
            isActive
              ? 'bg-brand-blue-primary text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>{tab.label}</span>
          {typeof count === 'number' && (
            <span
              className={`inline-block min-w-[1.5em] text-center tabular-nums text-[11px] ${
                isActive ? 'text-white/85' : 'text-slate-400'
              }`}
            >
              {count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
