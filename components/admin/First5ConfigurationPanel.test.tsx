import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { First5ConfigurationPanel } from './First5ConfigurationPanel';
import type { First5GlobalConfig } from '@/types';

const Harness: React.FC<{ onChange: (c: First5GlobalConfig) => void }> = ({
  onChange,
}) => {
  const [config, setConfig] = useState<First5GlobalConfig>({
    activeDayNumber: 7,
    referenceDate: '2000-01-01',
  } as First5GlobalConfig);
  return (
    <First5ConfigurationPanel
      config={config}
      onChange={(c) => {
        onChange(c);
        setConfig(c);
      }}
    />
  );
};

describe('First5ConfigurationPanel day number', () => {
  it('lets the admin clear the field to retype without snapping back', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText(/Today's Day Number/i);
    fireEvent.change(input, { target: { value: '' } });
    expect((input as HTMLInputElement).value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ activeDayNumber: 12 })
    );
  });

  it('shows the clamped value when the admin types 0', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText(/Today's Day Number/i);
    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ activeDayNumber: 1 })
    );
    expect((input as HTMLInputElement).value).toBe('1');
  });
});
