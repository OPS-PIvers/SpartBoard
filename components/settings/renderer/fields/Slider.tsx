import React from 'react';
import type { FieldProps } from '../FieldProps';
import type { SliderField as SliderFieldSchema } from '@/components/settings/schema/types';

export const SliderField: React.FC<FieldProps<SliderFieldSchema<string>>> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  disabled,
}) => {
  const current = typeof value === 'number' ? value : field.min;
  return (
    <div className="flex items-center gap-3">
      <input // no-tour-anchor: covered by the settings.field row anchor
        id={id}
        type="range"
        value={current}
        min={field.min}
        max={field.max}
        step={field.step}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="w-full disabled:opacity-50 focus:outline-hidden focus:ring-2 focus:ring-offset-1 focus:ring-brand-blue-primary"
      />
      <span
        aria-hidden="true"
        className="text-xxs text-slate-600 w-8 text-right"
      >
        {current}
      </span>
    </div>
  );
};
