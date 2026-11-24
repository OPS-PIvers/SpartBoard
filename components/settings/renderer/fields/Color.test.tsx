import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldRenderer } from '../FieldRenderer';
import type { ColorField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const field: ColorField<string> = {
  type: 'color',
  key: 'fontColor',
  label: 'label',
};

describe('Color field', () => {
  it('renders default text-color presets and marks the current value checked', () => {
    const ctx = makeCtx({ fontColor: '#334155' });
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /Slate/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('uses field-provided presets when given', () => {
    const withPresets: ColorField<string> = {
      ...field,
      presets: ['#111111', '#222222'],
    };
    const ctx = makeCtx({});
    render(
      <FieldRenderer
        field={withPresets}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /#111111/i })).toBeInTheDocument();
  });

  it('calls updateConfig with the field key on selection', () => {
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
    screen.getByRole('radio', { name: /Black/i }).click();
    expect(updateConfig).toHaveBeenCalledWith({ fontColor: '#000000' });
  });

  it('offers a transparent option only when allowTransparent is set', () => {
    const ctx = makeCtx({});
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('radio', { name: /Transparent/i })
    ).not.toBeInTheDocument();
  });

  it('writes the transparent sentinel when cleared', () => {
    const withTransparent: ColorField<string> = {
      ...field,
      allowTransparent: true,
    };
    const ctx = makeCtx({ fontColor: '#000000' });
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={withTransparent}
        widget={widget}
        ctx={ctx}
        updateConfig={updateConfig}
      />
    );
    screen.getByRole('radio', { name: /Transparent/i }).click();
    expect(updateConfig).toHaveBeenCalledWith({ fontColor: 'transparent' });
  });

  it('honours disabled', () => {
    const field2: ColorField<string> = { ...field, disabledWhen: () => true };
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
