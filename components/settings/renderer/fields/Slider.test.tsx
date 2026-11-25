import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type {
  FieldCtx,
  UpdateConfig,
  SliderField as SliderFieldType,
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

const field: SliderFieldType<string> = {
  type: 'slider',
  key: 'volume',
  label: 'Volume',
  min: 0,
  max: 100,
  step: 10,
};

describe('SliderField', () => {
  it('renders the current value and a live readout', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ volume: 40 })}
        updateConfig={vi.fn()}
      />
    );
    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(slider).toHaveValue('40');
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('falls back to min when value is missing', () => {
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({})}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('slider')).toHaveValue('0');
  });

  it('calls onChange with a number', () => {
    const updateConfig = vi.fn() as UpdateConfig;
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={makeCtx({ volume: 40 })}
        updateConfig={updateConfig}
      />
    );
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } });
    expect(updateConfig).toHaveBeenCalledWith({ volume: 70 });
  });

  it('honours disabled', () => {
    const disabledField: SliderFieldType<string> = {
      ...field,
      disabledWhen: () => true,
    };
    render(
      <FieldRenderer
        field={disabledField}
        widget={widget}
        ctx={makeCtx({ volume: 40 })}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('slider')).toBeDisabled();
  });
});
