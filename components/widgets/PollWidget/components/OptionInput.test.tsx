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
    // In the browser, pressing Escape while an input is focused triggers
    // onKeyDown synchronously, which sets cancelledRef.current = true and
    // calls input.blur() — firing onBlur while the ref is still true.
    // onBlur reads the ref and returns early, so onSave is never called.
    //
    // In jsdom, fireEvent.change() does NOT focus the element, so
    // e.currentTarget.blur() inside the handler is a no-op. We fire
    // fireEvent.blur() explicitly to replicate the browser-generated blur.
    // The single act() ensures setVal(label) flushes before the assertions.
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

  it('calls onSave when Enter is pressed during an edit', () => {
    const handleSave = vi.fn();
    render(<OptionInput label="Original" index={0} onSave={handleSave} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'New Value' } });
    // In jsdom, e.currentTarget.blur() inside the Enter handler is a no-op —
    // the programmatic blur does not dispatch a real blur event, so onBlur never
    // fires from it. fireEvent.blur() below is the only call that reaches onBlur,
    // meaning onSave is called exactly once. toHaveBeenCalledTimes(1) verifies
    // no double-save (same reasoning as the Escape test comment above).
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.blur(input);
    });

    expect(handleSave).toHaveBeenCalledTimes(1);
    expect(handleSave).toHaveBeenCalledWith(0, 'New Value');
  });
});
