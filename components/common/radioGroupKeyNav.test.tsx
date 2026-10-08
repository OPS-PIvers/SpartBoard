import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';

// Options list containing falsy values (null, 0) — the exact shape that
// exposed the "if (!nextOption) return" bug (a bounds check on nextIdx was
// needed instead of a truthiness check on the option value itself).
const OPTIONS: readonly (number | null)[] = [null, 0, 1, 2];

const TestGroup: React.FC<{ onSelect: (o: number | null) => void }> = ({
  onSelect,
}) => (
  <div
    role="radiogroup"
    onKeyDown={(e) => handleRadioGroupKeyDown(e, OPTIONS, onSelect)}
  >
    {OPTIONS.map((o) => (
      <button key={String(o)} type="button" role="radio" aria-checked={false}>
        {o === null ? 'None' : `Level ${o}`}
      </button>
    ))}
  </div>
);

describe('handleRadioGroupKeyDown', () => {
  it('reaches a falsy option (null) via ArrowLeft, not just truthy ones', () => {
    const onSelect = vi.fn();
    render(<TestGroup onSelect={onSelect} />);
    const level0 = screen.getByRole('radio', { name: 'Level 0' });
    const none = screen.getByRole('radio', { name: 'None' });

    level0.focus();
    fireEvent.keyDown(level0, { key: 'ArrowLeft' });
    expect(none).toHaveFocus();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('reaches a falsy option (0) via ArrowRight, not just truthy ones', () => {
    const onSelect = vi.fn();
    render(<TestGroup onSelect={onSelect} />);
    const none = screen.getByRole('radio', { name: 'None' });
    const level0 = screen.getByRole('radio', { name: 'Level 0' });

    none.focus();
    fireEvent.keyDown(none, { key: 'ArrowRight' });
    expect(level0).toHaveFocus();
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('Home lands on the falsy first option (null)', () => {
    const onSelect = vi.fn();
    render(<TestGroup onSelect={onSelect} />);
    const level2 = screen.getByRole('radio', { name: 'Level 2' });
    const none = screen.getByRole('radio', { name: 'None' });

    level2.focus();
    fireEvent.keyDown(level2, { key: 'Home' });
    expect(none).toHaveFocus();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('aliases ArrowDown to ArrowRight, reaching a falsy option (0)', () => {
    const onSelect = vi.fn();
    render(<TestGroup onSelect={onSelect} />);
    const none = screen.getByRole('radio', { name: 'None' });
    const level0 = screen.getByRole('radio', { name: 'Level 0' });

    none.focus();
    fireEvent.keyDown(none, { key: 'ArrowDown' });
    expect(level0).toHaveFocus();
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('aliases ArrowUp to ArrowLeft, reaching a falsy option (null)', () => {
    const onSelect = vi.fn();
    render(<TestGroup onSelect={onSelect} />);
    const level0 = screen.getByRole('radio', { name: 'Level 0' });
    const none = screen.getByRole('radio', { name: 'None' });

    level0.focus();
    fireEvent.keyDown(level0, { key: 'ArrowUp' });
    expect(none).toHaveFocus();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('wraps with ArrowDown/ArrowUp exactly as ArrowRight/ArrowLeft do', () => {
    const onSelect = vi.fn();
    render(<TestGroup onSelect={onSelect} />);
    const none = screen.getByRole('radio', { name: 'None' });
    const level2 = screen.getByRole('radio', { name: 'Level 2' });

    none.focus();
    fireEvent.keyDown(none, { key: 'ArrowUp' });
    expect(level2).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith(2);

    fireEvent.keyDown(level2, { key: 'ArrowDown' });
    expect(none).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('ignores ArrowDown/ArrowUp with a modifier held', () => {
    const onSelect = vi.fn();
    render(<TestGroup onSelect={onSelect} />);
    const level1 = screen.getByRole('radio', { name: 'Level 1' });
    level1.focus();
    fireEvent.keyDown(level1, { key: 'ArrowDown', ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(level1).toHaveFocus();
  });

  it('ignores keys with a modifier held', () => {
    const onSelect = vi.fn();
    render(<TestGroup onSelect={onSelect} />);
    const level1 = screen.getByRole('radio', { name: 'Level 1' });
    level1.focus();
    fireEvent.keyDown(level1, { key: 'ArrowRight', ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(level1).toHaveFocus();
  });
});

describe('handleRadioGroupKeyDown with a non-radio child', () => {
  it('leaves arrow/Home/End keys typed in a text input alone', () => {
    const onSelect = vi.fn();
    render(
      <div
        role="radiogroup"
        onKeyDown={(e) => handleRadioGroupKeyDown(e, OPTIONS, onSelect)}
      >
        {OPTIONS.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={false}
          >
            {String(o)}
          </button>
        ))}
        <input aria-label="hex" />
      </div>
    );
    const input = screen.getByLabelText('hex');
    input.focus();
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      const notPrevented = fireEvent.keyDown(input, { key });
      expect(notPrevented).toBe(true);
    }
    expect(input).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
