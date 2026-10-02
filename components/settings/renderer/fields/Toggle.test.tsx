import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type {
  FieldCtx,
  UpdateConfig,
} from '@/components/settings/schema/types';
import type { ToggleField as ToggleFieldType } from '@/components/settings/schema/types';
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

const field: ToggleFieldType<string> = {
  type: 'toggle',
  key: 'enabled',
  label: 'Enabled',
};

describe('ToggleField', () => {
  it('renders a switch with the accessible name from the label row', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ enabled: true })}
        updateConfig={vi.fn()}
      />
    );
    const control = screen.getByRole('switch');
    expect(control).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('tags the switch as a per-field tour anchor', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ enabled: true })}
        updateConfig={vi.fn()}
      />
    );
    const control = screen.getByRole('switch');
    expect(control).toHaveAttribute('data-tour', 'settings.toggle');
    expect(control).toHaveAttribute('data-tour-widget-type', 'clock');
    expect(control).toHaveAttribute('data-tour-field', 'enabled');
  });

  it('calls onChange with the flipped boolean', () => {
    const updateConfig = vi.fn() as UpdateConfig;
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ enabled: false })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(updateConfig).toHaveBeenCalledWith({ enabled: true });
  });

  it('honours disabledWhen', () => {
    const disabledField: ToggleFieldType<string> = {
      ...field,
      disabledWhen: () => true,
    };
    render(
      <FieldRenderer
        field={disabledField}
        widget={widget}
        ctx={makeCtx({ enabled: false })}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('falls back to false when value is missing', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({})}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});
