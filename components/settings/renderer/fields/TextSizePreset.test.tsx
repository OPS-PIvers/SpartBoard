import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldRenderer } from '../FieldRenderer';
import type { TextSizePresetField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const field: TextSizePresetField<string> = {
  type: 'textSizePreset',
  key: 'textSizePreset',
  label: 'label',
};

describe('TextSizePreset field', () => {
  it('renders a radiogroup with the current preset selected', () => {
    const ctx = makeCtx({ textSizePreset: 'large' });
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /^Large$/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('derives the selected preset from a legacy scaleMultiplier when textSizePreset is unset', () => {
    // Pre-preset widgets persisted a raw scaleMultiplier; the field must forward it through.
    const ctx = makeCtx({ scaleMultiplier: 1.5 });
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /^X-Large$/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  // Pins every branch of presetFromScale's thresholds, including both sides of
  // each boundary — nothing else in the repo covers that mapping directly.
  it.each([
    [0.5, 'Small'],
    [0.92, 'Small'],
    [0.93, 'Medium'],
    [1, 'Medium'],
    [1.09, 'Medium'],
    [1.1, 'Large'],
    [1.31, 'Large'],
    [1.32, 'X-Large'],
    [2, 'X-Large'],
  ])('maps a legacy scaleMultiplier of %s to the %s preset', (scale, label) => {
    const ctx = makeCtx({ scaleMultiplier: scale });
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(
      screen.getByRole('radio', { name: new RegExp(`^${label}$`, 'i') })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('prefers an explicit textSizePreset over a stale legacy scaleMultiplier', () => {
    const ctx = makeCtx({ textSizePreset: 'small', scaleMultiplier: 1.5 });
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /^Small$/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
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
    screen.getByRole('radio', { name: /X-Large/i }).click();
    expect(updateConfig).toHaveBeenCalledWith({ textSizePreset: 'x-large' });
  });

  it('honours disabled', () => {
    const field2: TextSizePresetField<string> = {
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
    expect(screen.getByRole('radio', { name: /Medium/i })).toBeDisabled();
  });
});
