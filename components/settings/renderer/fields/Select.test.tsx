import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type {
  FieldCtx,
  UpdateConfig,
  SelectField as SelectFieldType,
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

const field: SelectFieldType<string> = {
  type: 'select',
  key: 'size',
  label: 'Size',
  options: [
    { value: 1, label: 'Small' },
    { value: 2, label: 'Large' },
  ],
};

describe('SelectField', () => {
  it('renders options and selects the current value', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ size: 2 })}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveValue('2');
  });

  it('emits the option value with its original type on change', () => {
    const updateConfig = vi.fn() as UpdateConfig;
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ size: 1 })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    expect(updateConfig).toHaveBeenCalledWith({ size: 2 });
  });

  it('honours disabled', () => {
    const disabledField: SelectFieldType<string> = {
      ...field,
      disabledWhen: () => true,
    };
    render(
      <FieldRenderer
        field={disabledField}
        widget={widget}
        ctx={makeCtx({ size: 1 })}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('resolves option labels as i18n leaves (widget scope, then common, then literal)', () => {
    const catalog: Record<string, string> = {
      'widgetSettings.clock.sizeSmall': 'Klein',
      'widgetSettings.common.sizeLarge': 'Groß',
    };
    const i18nT = (key: string, options?: Record<string, unknown>): string =>
      catalog[key] ??
      (typeof options?.defaultValue === 'string' ? options.defaultValue : key);
    const leafField: SelectFieldType<string> = {
      ...field,
      options: [
        { value: 1, label: 'sizeSmall' },
        { value: 2, label: 'sizeLarge' },
        { value: 3, label: 'Huge' },
      ],
    };
    render(
      <FieldRenderer
        field={leafField}
        widget={widget}
        ctx={{ ...makeCtx({ size: 1 }), t: i18nT }}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('option', { name: 'Klein' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Groß' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Huge' })).toBeInTheDocument();
  });
});
