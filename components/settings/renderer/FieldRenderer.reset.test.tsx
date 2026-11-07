import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WidgetData } from '@/types';
import type { Field, FieldCtx } from '@/components/settings/schema/types';
import { FieldRenderer } from '@/components/settings/renderer/FieldRenderer';

const widget = { id: 'w1', type: 'clock' } as WidgetData;

const ctx = (config: Record<string, unknown>): FieldCtx => ({
  config,
  widget,
  isAdmin: false,
  canAccessFeature: () => true,
  t: (key: string, options?: Record<string, unknown>) =>
    key.endsWith('.reset')
      ? 'Reset'
      : typeof options?.defaultValue === 'string'
        ? options.defaultValue
        : key,
});

const field = {
  type: 'text',
  key: 'palette',
  label: 'title',
  readValue: (c: FieldCtx) => c.config.palette,
} as unknown as Field;

const renderWith = (value: unknown, def: unknown) =>
  render(
    <FieldRenderer
      field={field}
      widget={widget}
      ctx={ctx({ palette: value })}
      updateConfig={vi.fn()}
      defaults={{ palette: def }}
    />
  );

describe('FieldRenderer reset link with structured values', () => {
  it('hides Reset when an array value deep-equals the default', () => {
    renderWith(['#fff', '#000'], ['#fff', '#000']);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('shows Reset when an array value differs from the default', () => {
    renderWith(['#fff', '#111'], ['#fff', '#000']);
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
  });
});
