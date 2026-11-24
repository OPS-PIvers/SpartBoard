import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldRenderer } from '../FieldRenderer';
import type { FontFamilyField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const field: FontFamilyField<string> = {
  type: 'fontFamily',
  key: 'fontFamily',
  label: 'label',
};

describe('FontFamily field', () => {
  it('renders a radiogroup with the current font selected', () => {
    const ctx = makeCtx({ fontFamily: 'font-serif' });
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={vi.fn()}
      />
    );
    const serif = screen.getByRole('radio', { name: /^Serif$/i });
    expect(serif).toHaveAttribute('aria-checked', 'true');
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
    screen.getByRole('radio', { name: /^Serif$/i }).click();
    expect(updateConfig).toHaveBeenCalledWith({ fontFamily: 'font-serif' });
  });

  it('clears back to undefined when the inherit option is chosen', () => {
    const ctx = makeCtx({ fontFamily: 'font-serif' });
    const updateConfig = vi.fn();
    render(
      <FieldRenderer
        field={field}
        widget={widget}
        ctx={ctx}
        updateConfig={updateConfig}
      />
    );
    screen.getByRole('radio', { name: /Inherit/i }).click();
    expect(updateConfig).toHaveBeenCalledWith({ fontFamily: undefined });
  });

  it('honours disabled', () => {
    const field2: FontFamilyField<string> = {
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
    expect(screen.getByRole('radio', { name: /^Serif$/i })).toBeDisabled();
  });
});
