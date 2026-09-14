import React from 'react';
import type { FieldProps } from '../FieldProps';
import type { TextField as TextFieldSchema } from '@/components/settings/schema/types';

export const TextField: React.FC<FieldProps<TextFieldSchema<string>>> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  disabled,
}) => (
  <input
    id={id}
    type="text"
    value={typeof value === 'string' ? value : ''}
    onChange={(e) => onChange(e.target.value)}
    onBlur={(e) => {
      const normalized = field.normalizeOnBlur?.(e.target.value);
      if (normalized !== undefined && normalized !== e.target.value) {
        onChange(normalized);
      }
    }}
    placeholder={field.placeholder}
    maxLength={field.maxLength}
    disabled={disabled}
    aria-describedby={describedBy}
    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
  />
);
