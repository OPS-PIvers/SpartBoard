// Clearing a number field must not commit 0 (min/max snapped to 0, step to an invalid 0).

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { NumberLineConfigurationPanel } from '@/components/admin/NumberLineConfigurationPanel';

afterEach(cleanup);

describe('NumberLineConfigurationPanel — cleared number fields', () => {
  it.each([['min'], ['max'], ['step']])(
    'does not commit a value when %s is cleared',
    (field) => {
      const onChange = vi.fn();
      render(<NumberLineConfigurationPanel config={{}} onChange={onChange} />);
      const input = document.querySelector<HTMLInputElement>(
        `[data-tour-widget-type="numberLine"][data-tour-field="${field}"]`
      );
      if (!input) throw new Error('field not found');
      fireEvent.change(input, { target: { value: '' } });
      expect(onChange).not.toHaveBeenCalled();
      expect(input.value).toBe('');
    }
  );
});
