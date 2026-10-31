import React from 'react';
import type { FieldProps } from '../FieldProps';
import type { SelectField as SelectFieldSchema } from '@/components/settings/schema/types';
import { resolveLabel } from '../resolveLabel';

export const SelectField: React.FC<FieldProps<SelectFieldSchema<string>>> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  disabled,
  ctx,
}) => {
  const current =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return (
    <select // no-tour-anchor: covered by the settings.field row anchor
      id={id}
      value={current}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(e) => {
        const option = field.options.find(
          (o) => String(o.value) === e.target.value
        );
        onChange(option ? option.value : e.target.value);
      }}
      className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 appearance-none cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    >
      {field.options.map((option) => (
        <option key={option.value} value={option.value}>
          {resolveLabel(ctx.t, ctx.widget.type, option.label)}
        </option>
      ))}
    </select>
  );
};
