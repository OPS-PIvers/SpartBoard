import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RecessGearConfigurationPanel } from './RecessGearConfigurationPanel';

const Harness = () => {
  const [config, setConfig] = useState<Record<string, unknown>>({
    fetchingStrategy: 'client',
    updateFrequencyMinutes: 15,
    temperatureRanges: [
      { id: 'r1', min: 10, max: 40, label: 'Coat', category: 'clothing' },
    ],
  });
  return <RecessGearConfigurationPanel config={config} onChange={setConfig} />;
};

describe('RecessGearConfigurationPanel temperature ranges', () => {
  it('keeps a cleared or half-typed temperature instead of snapping it to 0', () => {
    render(<Harness />);
    const min = screen.getByPlaceholderText<HTMLInputElement>('Min');
    fireEvent.change(min, { target: { value: '' } });
    expect(min.value).toBe('');
  });

  it('commits a negative temperature once it is a valid number', () => {
    render(<Harness />);
    const min = screen.getByPlaceholderText<HTMLInputElement>('Min');
    fireEvent.change(min, { target: { value: '' } });
    fireEvent.change(min, { target: { value: '-5' } });
    expect(min.value).toBe('-5');
    fireEvent.blur(min);
    expect(min.value).toBe('-5');
  });

  it('shows the stored temperature again after leaving an emptied field', () => {
    render(<Harness />);
    const max = screen.getByPlaceholderText<HTMLInputElement>('Max');
    fireEvent.change(max, { target: { value: '' } });
    fireEvent.blur(max);
    expect(max.value).toBe('40');
  });
});
