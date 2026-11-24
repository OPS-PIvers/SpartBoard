import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type {
  FieldCtx,
  UpdateConfig,
  SegmentedField as SegmentedFieldType,
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

const field: SegmentedFieldType<string> = {
  type: 'segmented',
  key: 'align',
  label: 'Align',
  options: [
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
  ],
};

describe('SegmentedField', () => {
  it('renders a radiogroup with the selected option checked', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ align: 'left' })}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'Right' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('calls onChange with the option value', () => {
    const updateConfig = vi.fn() as UpdateConfig;
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ align: 'left' })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Right' }));
    expect(updateConfig).toHaveBeenCalledWith({ align: 'right' });
  });

  it('honours disabled', () => {
    const disabledField: SegmentedFieldType<string> = {
      ...field,
      disabledWhen: () => true,
    };
    render(
      <FieldRenderer
        field={disabledField}
        widget={widget}
        ctx={makeCtx({ align: 'left' })}
        updateConfig={vi.fn()}
      />
    );
    screen
      .getAllByRole('radio')
      .forEach((radio) => expect(radio).toBeDisabled());
  });

  it('resolves option labels as i18n leaves (widget scope, then common, then literal)', () => {
    const catalog: Record<string, string> = {
      'widgetSettings.clock.alignLeft': 'Links',
      'widgetSettings.common.alignRight': 'Rechts',
    };
    const i18nT = (key: string, options?: Record<string, unknown>): string =>
      catalog[key] ??
      (typeof options?.defaultValue === 'string' ? options.defaultValue : key);
    const leafField: SegmentedFieldType<string> = {
      ...field,
      options: [
        { value: 'left', label: 'alignLeft' },
        { value: 'right', label: 'alignRight' },
        { value: 'center', label: 'Center' },
      ],
    };
    render(
      <FieldRenderer
        field={leafField}
        widget={widget}
        ctx={{ ...makeCtx({ align: 'left' }), t: i18nT }}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: 'Links' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Rechts' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Center' })).toBeInTheDocument();
  });

  it('shows disabled styling when an ancestor fieldset is disabled', () => {
    render(
      <fieldset disabled>
        <FieldRenderer
          field={field}
          widget={widget}
          ctx={makeCtx({ align: 'left' })}
          updateConfig={vi.fn()}
        />
      </fieldset>
    );
    const radio = screen.getByRole('radio', { name: 'Left' });
    expect(radio).toBeDisabled();
    expect(radio.className).toContain('disabled:opacity-50');
    expect(radio.className).toContain('disabled:cursor-not-allowed');
  });
});
