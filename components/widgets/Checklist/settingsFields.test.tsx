import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { ChecklistImportActionsField } from './settingsFields';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ activeDashboard: null, addToast: vi.fn() }),
}));

const makeCtx = (
  config: Record<string, unknown>,
  updateConfig = vi.fn()
): CustomRenderCtx =>
  ({
    config,
    widget: {
      id: 'checklist-test',
      type: 'checklist',
      x: 0,
      y: 0,
      w: 300,
      h: 300,
      z: 1,
      flipped: false,
      config,
    },
    isAdmin: true,
    canAccessFeature: () => true,
    t: (key: string) => key,
    updateConfig,
    id: 'field',
    labelId: 'field-label',
  }) as unknown as CustomRenderCtx;

describe('ChecklistImportActionsField paste box', () => {
  it('appends each pasted non-empty line as a task', () => {
    const updateConfig = vi.fn();
    const existing = { id: 'a', text: 'Existing', completed: true };
    render(
      <ChecklistImportActionsField
        ctx={makeCtx({ items: [existing], mode: 'roster' }, updateConfig)}
      />
    );
    const box = screen.getByLabelText('widgetSettings.checklist.pasteTasks');
    fireEvent.change(box, { target: { value: ' Warm-up \n\nRead\r\nExit' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'widgetSettings.checklist.addPastedTasks',
      })
    );

    expect(updateConfig).toHaveBeenCalledTimes(1);
    const patch = updateConfig.mock.calls[0][0] as {
      items: Array<{ text: string; completed: boolean }>;
      mode: string;
    };
    expect(patch.mode).toBe('manual');
    expect(patch.items[0]).toBe(existing);
    expect(patch.items.slice(1).map((item) => item.text)).toEqual([
      'Warm-up',
      'Read',
      'Exit',
    ]);
    expect(patch.items.slice(1).every((item) => !item.completed)).toBe(true);
    expect(box).toHaveValue('');
  });

  it('disables the add button until something is pasted', () => {
    render(<ChecklistImportActionsField ctx={makeCtx({})} />);
    expect(
      screen.getByRole('button', {
        name: 'widgetSettings.checklist.addPastedTasks',
      })
    ).toBeDisabled();
  });
});
