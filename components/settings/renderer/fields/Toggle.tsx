import React from 'react';
import type { FieldProps } from '../FieldProps';
import type { ToggleField as ToggleFieldSchema } from '@/components/settings/schema/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { Toggle } from '@/components/common/Toggle';

export const ToggleField: React.FC<FieldProps<ToggleFieldSchema<string>>> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  disabled,
  ctx,
  tourKey,
}) => (
  <Toggle
    id={id}
    checked={Boolean(value)}
    onChange={onChange}
    describedBy={describedBy}
    disabled={disabled}
    showLabels={false}
    anchor={tourFieldAttr(
      'settings.toggle',
      ctx.widget.type,
      tourKey ?? field.key
    )}
  />
);
