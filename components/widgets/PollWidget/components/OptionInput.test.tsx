import { render, screen } from '@testing-library/react';
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
});
