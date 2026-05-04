import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResetOnChange } from '../../hooks/useResetOnChange';

describe('useResetOnChange', () => {
  it('does not call onChange on the initial render', () => {
    const onChange = vi.fn();
    renderHook(({ value }) => useResetOnChange(value, onChange), {
      initialProps: { value: 'a' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange when the tracked value changes', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(
      ({ value }) => useResetOnChange(value, onChange),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('b', 'a');
  });

  it('does not call onChange when the value is identical (Object.is)', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(
      ({ value }) => useResetOnChange(value, onChange),
      { initialProps: { value: 42 } }
    );

    rerender({ value: 42 });
    rerender({ value: 42 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes prev value to the callback', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(
      ({ value }) => useResetOnChange(value, onChange),
      { initialProps: { value: 1 } }
    );

    rerender({ value: 2 });
    rerender({ value: 3 });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 2, 1);
    expect(onChange).toHaveBeenNthCalledWith(2, 3, 2);
  });

  it('treats NaN as equal to NaN (Object.is semantics)', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(
      ({ value }) => useResetOnChange(value, onChange),
      { initialProps: { value: NaN } }
    );

    rerender({ value: NaN });
    expect(onChange).not.toHaveBeenCalled();
  });
});
