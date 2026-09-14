import React from 'react';
import type { AccentColorField } from '@/components/settings/schema/types';
import type { FieldProps } from '../FieldProps';
import { AccentColorSettings } from '@/components/common/AccentColorSettings';
import { resolveLabel } from '../resolveLabel';

const DEFAULT_FALLBACK = '#334155';

// Thin wrapper over the shared accent-color picker (presets + custom + clear-to-default).
export const AccentColor: React.FC<FieldProps<AccentColorField<string>>> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  labelId,
  disabled,
  ctx,
}) => {
  const label = resolveLabel(ctx.t, ctx.widget.type, field.label);
  const current = typeof value === 'string' ? value : undefined;

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
    >
      <fieldset disabled={disabled} className="contents">
        <AccentColorSettings
          hideLabel
          label={label}
          value={current}
          fallback={field.fallback?.(ctx) ?? DEFAULT_FALLBACK}
          fallbackLabel={
            field.fallbackLabel
              ? resolveLabel(ctx.t, ctx.widget.type, field.fallbackLabel)
              : undefined
          }
          onChange={(color) => onChange(color)}
        />
      </fieldset>
    </div>
  );
};
