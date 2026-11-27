import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CustomWidgetSettingsField } from './settingsFields';
import {
  CustomWidgetsContext,
  CustomWidgetsContextValue,
} from '@/context/CustomWidgetsContextValue';
import type { CustomRenderCtx } from '@/components/settings/schema/types';

const value = {
  customWidgets: [
    {
      id: 'cw1',
      settings: [{ key: 'count', label: 'Count', type: 'number' }],
    },
  ],
} as unknown as CustomWidgetsContextValue;

const ctx = {
  id: 'f',
  labelId: 'l',
  describedBy: 'd',
  t: (k: string) => k,
  widget: { id: 'w1', type: 'custom-widget' },
  config: { customWidgetId: 'cw1', adminSettings: { count: 5 } },
  updateConfig: vi.fn(),
} as unknown as CustomRenderCtx;

describe('CustomWidgetSettingsField number input', () => {
  it('lets the teacher clear the field without snapping it to 0', () => {
    render(
      <CustomWidgetsContext.Provider value={value}>
        <CustomWidgetSettingsField ctx={ctx} />
      </CustomWidgetsContext.Provider>
    );
    const input = screen.getByLabelText<HTMLInputElement>('Count');
    expect(input.value).toBe('5');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });
  it('shows a number stored as text', () => {
    const textCtx = {
      ...ctx,
      config: { customWidgetId: 'cw1', adminSettings: { count: '10' } },
    } as unknown as CustomRenderCtx;
    render(
      <CustomWidgetsContext.Provider value={value}>
        <CustomWidgetSettingsField ctx={textCtx} />
      </CustomWidgetsContext.Provider>
    );
    expect(screen.getByLabelText<HTMLInputElement>('Count').value).toBe('10');
  });
});
