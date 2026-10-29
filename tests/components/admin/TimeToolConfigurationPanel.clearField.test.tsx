// Clearing a duration field must not commit 0 (it snapped the saved duration).

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import type { TimeToolGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { TimeToolConfigurationPanel } from '@/components/admin/TimeToolConfigurationPanel';

afterEach(cleanup);

describe('TimeToolConfigurationPanel — cleared duration fields', () => {
  it.each([['durationMinutes'], ['durationSeconds']])(
    'does not commit a value when %s is cleared',
    (field) => {
      const onChange = vi.fn();
      render(
        <TimeToolConfigurationPanel
          config={{} as TimeToolGlobalConfig}
          onChange={onChange}
        />
      );
      const input = document.querySelector<HTMLInputElement>(
        `[data-tour-widget-type="time-tool"][data-tour-field="${field}"]`
      );
      if (!input) throw new Error('field not found');
      fireEvent.change(input, { target: { value: '' } });
      expect(onChange).not.toHaveBeenCalled();
      expect(input.value).toBe('');
    }
  );

  it('saves a whole-second duration when a fraction is typed', () => {
    const onChange = vi.fn();
    render(
      <TimeToolConfigurationPanel
        config={{} as TimeToolGlobalConfig}
        onChange={onChange}
      />
    );
    const input = document.querySelector<HTMLInputElement>(
      '[data-tour-widget-type="time-tool"][data-tour-field="durationSeconds"]'
    );
    if (!input) throw new Error('field not found');
    fireEvent.change(input, { target: { value: '30.5' } });
    const saved = onChange.mock.calls[0][0] as TimeToolGlobalConfig;
    const duration = Object.values(saved.buildingDefaults ?? {})[0]?.duration;
    expect(Number.isInteger(duration)).toBe(true);
  });
});
