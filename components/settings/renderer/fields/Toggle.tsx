import React from 'react';
import type { FieldProps } from '../FieldProps';
import type { ToggleField as ToggleFieldSchema } from '@/components/settings/schema/types';
import { tourFieldAttr } from '@/config/tourAnchors';

export const ToggleField: React.FC<FieldProps<ToggleFieldSchema<string>>> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  disabled,
  ctx,
  tourKey,
}) => {
  const checked = Boolean(value);
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...tourFieldAttr(
        'settings.toggle',
        ctx.widget.type,
        tourKey ?? field.key
      )}
      className={`w-11 h-6 rounded-full relative transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue-primary flex-shrink-0 ${
        checked ? 'bg-brand-blue-primary' : 'bg-slate-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
};
