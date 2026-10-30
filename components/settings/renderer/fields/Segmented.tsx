import React from 'react';
import type { FieldProps } from '../FieldProps';
import type { SegmentedField as SegmentedFieldSchema } from '@/components/settings/schema/types';
import { resolveLabel } from '../resolveLabel';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';

export const SegmentedField: React.FC<
  FieldProps<SegmentedFieldSchema<string>>
> = ({ field, value, onChange, id, describedBy, labelId, disabled, ctx }) => {
  const options = field.options;
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      onKeyDown={(e) =>
        handleRadioGroupKeyDown(e, options, (opt) => onChange(opt.value))
      }
      className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1"
    >
      {options.map((option, index) => {
        const selected = value === option.value;
        const tabbable = selected || (selectedIndex < 0 && index === 0);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={option.value}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-md transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-offset-1 focus:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed ${
              selected
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {option.icon}
            {resolveLabel(ctx.t, ctx.widget.type, option.label)}
          </button>
        );
      })}
    </div>
  );
};
