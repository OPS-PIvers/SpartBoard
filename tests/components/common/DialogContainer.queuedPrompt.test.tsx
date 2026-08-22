import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { DialogProvider } from '@/context/DialogContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { useDialog } from '@/context/useDialog';

// tests/setup.ts globally mocks useDialog with no-op stubs so most component
// tests don't need a real DialogProvider. This suite exercises the real
// DialogContext + DialogContainer integration, so undo that mock here.
vi.unmock('@/context/useDialog');

afterEach(cleanup);

// Fires two showPrompt() calls back-to-back (same tick) so the second is
// queued behind the first — this is how DialogContext is meant to be used
// when a caller chains prompts (e.g. rename-then-confirm flows).
const QueueTwoPrompts: React.FC = () => {
  const { showPrompt } = useDialog();
  return (
    <button
      onClick={() => {
        void showPrompt('First question', { defaultValue: 'foo' });
        void showPrompt('Second question', { defaultValue: 'bar' });
      }}
    >
      Trigger
    </button>
  );
};

describe('DialogContext queued prompts — input state must not leak between dialogs', () => {
  it('shows the second prompt dialog with its own defaultValue, not the first dialog leftover input', () => {
    render(
      <DialogProvider>
        <QueueTwoPrompts />
        <DialogContainer />
      </DialogProvider>
    );

    fireEvent.click(screen.getByText('Trigger'));

    // First dialog is showing with its own defaultValue.
    const firstInput = screen.getByPlaceholderText<HTMLInputElement>('');
    expect(screen.getByText('First question')).toBeTruthy();
    expect(firstInput.value).toBe('foo');

    // User edits the first dialog's input before submitting it.
    fireEvent.change(firstInput, { target: { value: 'edited by user' } });
    expect(firstInput.value).toBe('edited by user');

    // Submit the first dialog — the queued second prompt should take over.
    fireEvent.click(screen.getByText('Submit'));

    expect(screen.getByText('Second question')).toBeTruthy();
    const secondInput = screen.getByPlaceholderText<HTMLInputElement>('');
    // Must reflect the SECOND dialog's own defaultValue ('bar'), never the
    // first dialog's leftover state ('edited by user').
    expect(secondInput.value).toBe('bar');
  });
});
