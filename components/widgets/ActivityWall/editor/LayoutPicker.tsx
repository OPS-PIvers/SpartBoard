import React from 'react';
import type { ActivityWallLayout } from '@/types';
import { LAYOUT_OPTIONS } from './layoutOptions';

interface LayoutPickerProps {
  value: ActivityWallLayout | null;
  onSelect: (layout: ActivityWallLayout) => void;
}

/** Step 1 of the wall editor: pick the layout from a visual card grid. */
export const LayoutPicker: React.FC<LayoutPickerProps> = ({
  value,
  onSelect,
}) => (
  <div>
    <p className="mb-4 text-sm text-slate-600">
      Pick how posts are arranged. Everything else is set on the next step.
    </p>
    <div
      role="group"
      aria-label="Wall layout"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {LAYOUT_OPTIONS.map((option) => {
        const selected = value === option.layout;
        return (
          <button
            key={option.layout}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(option.layout)}
            className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
              selected
                ? 'border-brand-blue-primary bg-brand-blue-primary/5 shadow-sm'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            {option.sketch}
            <span className="text-sm font-bold text-slate-800">
              {option.label}
            </span>
            <span className="text-xs text-slate-600">{option.description}</span>
          </button>
        );
      })}
    </div>
  </div>
);
