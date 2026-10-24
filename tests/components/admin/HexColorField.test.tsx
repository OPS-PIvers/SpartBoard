import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HexColorField } from '@/components/admin/HexColorField';

const setup = (value: string | undefined) => {
  const onChange = vi.fn();
  render(
    <HexColorField
      value={value}
      onChange={onChange}
      fallback="#000000"
      ariaLabel="Color"
      id="hex"
    />
  );
  return { onChange, input: document.getElementById('hex') as HTMLElement };
};

describe('HexColorField', () => {
  it('does not write when blurred with an unchanged value', () => {
    const { onChange, input } = setup('#334155');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not write a clear when blurred empty with no value', () => {
    const { onChange, input } = setup(undefined);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits an edited valid value', () => {
    const { onChange, input } = setup('#334155');
    fireEvent.change(input, { target: { value: '#112233' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('#112233');
    expect(screen.getByLabelText('Color')).toBeTruthy();
  });
});
