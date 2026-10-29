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
});
