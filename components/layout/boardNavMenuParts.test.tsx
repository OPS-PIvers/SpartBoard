import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InlineNameInput } from './boardNavMenuParts';

describe('InlineNameInput', () => {
  it('commits on Enter', () => {
    const onCommit = vi.fn();
    render(
      <InlineNameInput
        ariaLabel="Name"
        placeholder="Name"
        commitOnBlur={false}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Period 1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Period 1');
  });

  it('does not commit when Enter confirms an IME composition', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <InlineNameInput
        ariaLabel="Name"
        placeholder="Name"
        commitOnBlur={false}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'にほん' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
