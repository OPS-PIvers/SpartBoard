import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type {
  FieldCtx,
  UpdateConfig,
  TextField as TextFieldType,
} from '@/components/settings/schema/types';
import { FieldRenderer } from '../FieldRenderer';

const t = (key: string, options?: Record<string, unknown>): string =>
  typeof options?.defaultValue === 'string' ? options.defaultValue : key;

const widget = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
} as WidgetData;

function makeCtx(config: Record<string, unknown>): FieldCtx {
  return { config, widget, isAdmin: false, canAccessFeature: () => true, t };
}

const field: TextFieldType<string> = {
  type: 'text',
  key: 'title',
  label: 'Title',
  placeholder: 'Enter a title',
};

describe('TextField', () => {
  it('renders the current value with an accessible label', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ title: 'Hello' })}
        updateConfig={vi.fn()}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveValue('Hello');
  });

  it('falls back to an empty string when value is missing', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({})}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('calls onChange with the typed string', () => {
    const updateConfig = vi.fn() as UpdateConfig;
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ title: '' })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New' } });
    expect(updateConfig).toHaveBeenCalledWith({ title: 'New' });
  });

  it('normalizes a completed edit on blur', () => {
    const updateConfig = vi.fn() as UpdateConfig;
    render(
      <FieldRenderer
        field={{
          ...field,
          normalizeOnBlur: (value) => `https://${value}`,
        }}
        widget={widget}
        ctx={makeCtx({ title: 'example.com' })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.blur(screen.getByRole('textbox'));
    expect(updateConfig).toHaveBeenCalledWith({ title: 'https://example.com' });
  });

  it('reads derived values and emits an atomic patch', () => {
    const updateConfig = vi.fn() as UpdateConfig;
    render(
      <FieldRenderer
        field={{
          ...field,
          readValue: () => 'Inherited',
          toPatch: (value) => ({ title: value, inherited: false }),
        }}
        widget={widget}
        ctx={makeCtx({})}
        updateConfig={updateConfig}
      />
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Inherited');
    fireEvent.change(input, { target: { value: 'Explicit' } });
    expect(updateConfig).toHaveBeenCalledWith({
      title: 'Explicit',
      inherited: false,
    });
  });

  it('resolves a placeholder leaf through the locale catalog', () => {
    const catalog: Record<string, string> = {
      'widgetSettings.clock.titlePlaceholder': 'e.g. Summer Break',
    };
    const resolvingT = (
      key: string,
      options?: Record<string, unknown>
    ): string =>
      catalog[key] ??
      (typeof options?.defaultValue === 'string' ? options.defaultValue : key);
    const leafField: TextFieldType<string> = {
      ...field,
      placeholder: 'titlePlaceholder',
    };
    render(
      <FieldRenderer
        field={leafField}
        widget={widget}
        ctx={{
          config: { title: '' },
          widget,
          isAdmin: false,
          canAccessFeature: () => true,
          t: resolvingT,
        }}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'e.g. Summer Break'
    );
  });

  it('honours disabled', () => {
    const disabledField: TextFieldType<string> = {
      ...field,
      disabledWhen: () => true,
    };
    render(
      <FieldRenderer
        field={disabledField}
        widget={widget}
        ctx={makeCtx({ title: '' })}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
