import React from 'react';
import type { FontFamilyField } from '@/components/settings/schema/types';
import type { FieldProps } from '../FieldProps';
import { TypographySettings } from '@/components/common/TypographySettings';
import { FontSelect } from '@/components/common/FontSelect';

type FontFamilyShimConfig = { fontFamily?: string };

// Thin wrapper: renders only the font-family swatch grid (no color picker — that's a separate `color` field).
export const FontFamily: React.FC<FieldProps<FontFamilyField<string>>> = ({
  value,
  onChange,
  id,
  describedBy,
  labelId,
  disabled,
  ctx,
}) => {
  const shimConfig: FontFamilyShimConfig = {
    fontFamily: typeof value === 'string' ? value : undefined,
  };
  const updateConfigShim = (patch: Partial<FontFamilyShimConfig>) => {
    onChange(patch.fontFamily);
  };

  if (ctx.surface === 'drawer') {
    return (
      <div id={id}>
        <FontSelect
          value={typeof value === 'string' ? value : 'global'}
          onChange={(fontId) =>
            onChange(fontId === 'global' ? undefined : fontId)
          }
          labelId={labelId}
          describedBy={describedBy}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div id={id}>
      <fieldset disabled={disabled} className="contents">
        <TypographySettings
          config={shimConfig}
          updateConfig={updateConfigShim}
          showColorPicker={false}
          hideLabel
          labelId={labelId}
          describedBy={describedBy}
        />
      </fieldset>
    </div>
  );
};
