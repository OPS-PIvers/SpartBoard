import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldRenderer } from '../FieldRenderer';
import type { AccentColorField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const field: AccentColorField<string> = {
  type: 'accentColor',
  key: 'themeColor',
  label: 'label',
};

describe('AccentColor field', () => {
  it('renders swatches and marks the current value checked', () => {
    const ctx = makeCtx({ themeColor: '#ad2122' });
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /Brand red/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('calls updateConfig with the hex value on selection', () => {
    const ctx = makeCtx({});
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={updateConfig}
      />
    );
    screen.getByRole('radio', { name: /Brand blue/i }).click();
    expect(updateConfig).toHaveBeenCalledWith({ themeColor: '#2d3f89' });
  });

  it('clears to undefined via the default swatch', () => {
    const ctx = makeCtx({ themeColor: '#ad2122' });
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={updateConfig}
      />
    );
    screen.getByRole('radio', { name: /Match/i }).click();
    expect(updateConfig).toHaveBeenCalledWith({ themeColor: undefined });
  });

  it('honours disabled', () => {
    const field2: AccentColorField<string> = {
      ...field,
      disabledWhen: () => true,
    };
    const ctx = makeCtx({});
    render(
      <FieldRenderer
        field={field2}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /Black/i })).toBeDisabled();
  });

  it('exposes an accessible group name', () => {
    const ctx = makeCtx({});
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('group', { name: 'Label' })).toBeInTheDocument();
  });
});
