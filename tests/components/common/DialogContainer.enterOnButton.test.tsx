import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

afterEach(cleanup);

const resolve = vi.fn();
let dialog: Record<string, unknown>;

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ currentDialog: dialog }),
}));

import { DialogContainer } from '@/components/common/DialogContainer';

describe('DialogContainer - Enter on a focused button', () => {
  it('does not confirm a non-destructive confirm while Cancel is focused', () => {
    resolve.mockClear();
    dialog = {
      kind: 'confirm',
      message: 'Go?',
      options: { variant: 'info' },
      resolve,
    };
    render(<DialogContainer />);
    const cancel = screen.getByRole('button', { name: /cancel/i });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Enter' });
    expect(resolve).not.toHaveBeenCalledWith(true);
  });

  it('does not submit a prompt while Cancel is focused', () => {
    resolve.mockClear();
    dialog = {
      kind: 'prompt',
      message: 'Name?',
      options: { defaultValue: 'abc' },
      resolve,
    };
    render(<DialogContainer />);
    const cancel = screen
      .getAllByRole('button', { name: /cancel/i })
      .at(-1) as HTMLElement;
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Enter' });
    expect(resolve).not.toHaveBeenCalledWith('abc');
  });

  it('still confirms on Enter from the input', () => {
    resolve.mockClear();
    dialog = {
      kind: 'prompt',
      message: 'Name?',
      options: { defaultValue: 'abc' },
      resolve,
    };
    render(<DialogContainer />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(resolve).toHaveBeenCalledWith('abc');
  });
});
