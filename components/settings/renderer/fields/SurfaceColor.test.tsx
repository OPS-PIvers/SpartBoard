import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldRenderer } from '../FieldRenderer';
import type { SurfaceColorField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const field: SurfaceColorField<string> = {
  type: 'surfaceColor',
  key: 'cardColor',
  label: 'label',
};

describe('SurfaceColor field', () => {
  it('renders the current color and opacity', () => {
    const ctx = makeCtx({ cardColor: '#ffffff', cardOpacity: 0.5 });
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /White/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('writes color changes through onChange (field.key)', () => {
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
    screen.getByRole('radio', { name: /Slate/i }).click();
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({ cardColor: '#f8fafc' });
  });

  it('writes opacity changes to the resolved opacityKey via updateConfig', () => {
    const ctx = makeCtx({ cardColor: '#ffffff', cardOpacity: 1 });
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={updateConfig}
      />
    );
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0.25' } });
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({ cardOpacity: 0.25 });
  });

  it('uses a custom opacityKey when provided', () => {
    const custom: SurfaceColorField<string> = {
      ...field,
      opacityKey: 'surfaceOpacity',
    };
    const ctx = makeCtx({ cardColor: '#ffffff', surfaceOpacity: 0.75 });
    render(
      <FieldRenderer
        field={custom}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('honours disabled', () => {
    const field2: SurfaceColorField<string> = {
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
    expect(screen.getByRole('slider')).toBeDisabled();
  });
});
