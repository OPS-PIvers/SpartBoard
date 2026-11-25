import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldRenderer } from '@/components/settings/renderer/FieldRenderer';
import {
  makeCtx,
  widget,
} from '@/components/settings/renderer/fields/testUtils';
import type { ColorField } from '@/components/settings/schema/types';
import { WIDGET_PALETTE } from '@/config/colors';
import schema from './settings.schema';

const displayGroup = schema.groups.find((g) => g.id === 'display');
if (!displayGroup) throw new Error('clock schema is missing its display group');
const themeColorField = displayGroup.fields.find(
  (f) => f.key === 'themeColor'
) as ColorField<string>;

// Legacy panel showed the 7 WIDGET_PALETTE swatches with no clear/transparent
// affordance (Settings.tsx pre-migration: WIDGET_PALETTE.map(...)). The
// generic accentColor field added a "Match" clear swatch that never existed
// here, so restore parity with `type: 'color'` + `presets: WIDGET_PALETTE`.
describe('clock themeColor field', () => {
  it('uses the Color field type with the 7-swatch WIDGET_PALETTE', () => {
    expect(themeColorField.type).toBe('color');
    expect(themeColorField.presets).toEqual(WIDGET_PALETTE);
  });

  it('renders exactly the 7 palette swatches with no clear control', () => {
    render(
      <FieldRenderer
        field={themeColorField}
        widget={widget}
        ctx={makeCtx({ themeColor: WIDGET_PALETTE[0] })}
        updateConfig={vi.fn()}
      />
    );
    const swatches = screen.getAllByRole('radio');
    expect(swatches).toHaveLength(WIDGET_PALETTE.length);
    expect(
      screen.queryByRole('radio', { name: /transparent/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /match/i })
    ).not.toBeInTheDocument();
  });
});
