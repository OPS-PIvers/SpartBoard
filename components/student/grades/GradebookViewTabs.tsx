import React from 'react';

export type GradebookView = 'scores' | 'targets';

const TABS: ReadonlyArray<{ id: GradebookView; label: string }> = [
  { id: 'scores', label: 'Scores' },
  { id: 'targets', label: 'Learning targets' },
];

/** Same look as the Assignments tab's Active/Completed switch. */
export const GradebookViewTabs: React.FC<{
  value: GradebookView;
  onChange: (v: GradebookView) => void;
}> = ({ value, onChange }) => (
  <div
    role="tablist"
    aria-label="Gradebook view"
    className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 p-1 shadow-sm"
  >
    {TABS.map((tab) => {
      const isActive = tab.id === value;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(tab.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1 ${
            isActive
              ? 'bg-brand-blue-primary text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);
