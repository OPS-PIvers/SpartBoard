// Clearing the update-frequency field must not commit the 15 fallback (it snapped back, so a new value could not be typed).

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { RecessGearConfigurationPanel } from '@/components/admin/RecessGearConfigurationPanel';

afterEach(cleanup);

describe('RecessGearConfigurationPanel — update frequency field', () => {
  it('keeps a cleared field empty and commits the retyped value', () => {
    const onChange = vi.fn();
    render(
      <RecessGearConfigurationPanel
        config={{ fetchingStrategy: 'admin_proxy', updateFrequencyMinutes: 30 }}
        onChange={onChange}
      />
    );
    const input = document.querySelector<HTMLInputElement>(
      '[data-tour-widget-type="recessGear"][data-tour-field="updateFrequencyMinutes"]'
    );
    if (!input) throw new Error('field not found');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ updateFrequencyMinutes: 45 })
    );
  });
});
