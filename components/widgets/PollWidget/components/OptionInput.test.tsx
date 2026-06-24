import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { OptionInput } from './OptionInput';

describe('OptionInput', () => {
  it('renders with initial label', () => {
    render(<OptionInput label="Initial Option" index={0} onSave={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('Initial Option');
  });

  it('updates input value on change', async () => {
    const user = userEvent.setup();
    render(<OptionInput label="Initial" index={0} onSave={vi.fn()} />);
    const input = screen.getByRole('textbox');

    await user.clear(input);
    await user.type(input, 'New Option');

    expect(input).toHaveValue('New Option');
  });

  it('calls onSave with updated value on blur', async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn();
    render(<OptionInput label="Initial" index={1} onSave={handleSave} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Updated Option');

    // blur the input to trigger onSave
    await user.tab();

    expect(handleSave).toHaveBeenCalledWith(1, 'Updated Option');
  });

  it('renders with correct placeholder when label is empty', () => {
    render(<OptionInput label="" index={2} onSave={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'Option 3'
    );
  });

  it('does NOT call onSave when Escape is pressed during an edit', () => {
    // Root-cause: OptionInput had onBlur={() => onSave(index, val)} but NO
    // onKeyDown handler. Pressing Escape triggers blur in browsers/jsdom, which
    // fired onSave with the edited (intended-to-cancel) value instead of the
    // original label.
    //
    // Fix: intercept Escape in onKeyDown — reset val to the original label and
    // call input.blur() from within the handler so blur fires AFTER the state
    // reset. onBlur must then guard against saving when the value equals the
    // original label, OR the cancel path must set a flag that onBlur checks.
    //
    // Test pattern (from repo backlog notes): wrap BOTH the keyDown and the
    // subsequent blur inside a single act() call — jsdom does NOT fire blur
    // automatically when a DOM node's value changes, so the single act() defers
    // React's state flush until after both events have fired.
    const handleSave = vi.fn();
    render(<OptionInput label="Original" index={0} onSave={handleSave} />);

    const input = screen.getByRole('textbox');

    // Simulate the teacher typing a new value then pressing Escape.
    fireEvent.change(input, { target: { value: 'Edited (mistake)' } });

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    // onSave must NOT have been called — the teacher cancelled the edit.
    expect(handleSave).not.toHaveBeenCalled();

    // The displayed value should revert to the original label.
    expect(input).toHaveValue('Original');
  });
});
