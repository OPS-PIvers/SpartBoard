import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorModalShell } from '@/components/common/EditorModalShell';

/** The footer's Close; the header X carries the same accessible name. */
const footerClose = () =>
  screen.getAllByRole('button', { name: 'Close' }).slice(-1)[0];

const showConfirm = vi.fn().mockResolvedValue(true);

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: (...args: unknown[]): Promise<boolean> =>
      showConfirm(...args) as Promise<boolean>,
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

describe('EditorModalShell autosave', () => {
  const baseProps = {
    isOpen: true,
    title: 'Draft item',
    onClose: vi.fn(),
    children: <div>body</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(true);
  });

  it('keeps the Save button when autosave is off', () => {
    render(<EditorModalShell {...baseProps} isDirty onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // The submit-mode Save is enabled even when incomplete, so without the
  // notice a click just silently no-ops. The notice is the only feedback.
  it('shows what is missing in submit mode too', () => {
    render(
      <EditorModalShell
        {...baseProps}
        isDirty
        onSave={vi.fn()}
        incompleteNotice="Question 2: correct answer is required"
      />
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Not ready to use yet: Question 2: correct answer is required'
      )
    ).toBeInTheDocument();
  });

  // Autosave is driven by the draft moving, so a test that wants a write has
  // to edit: mounting an editor on a record must never write it straight back.
  const renderShell = (props: {
    onSave: () => void | Promise<void>;
    onClose?: () => void;
    incompleteNotice?: string;
    delayMs?: number;
  }) => {
    const { delayMs = 20, ...rest } = props;
    const ui = (token: string) => (
      <EditorModalShell
        {...baseProps}
        {...rest}
        isDirty
        autosave={{ draftToken: [token], resetKey: 'item-1', delayMs }}
      />
    );
    const view = render(ui('a'));
    return { ...view, edit: () => view.rerender(ui('b')) };
  };

  it('writes nothing until the draft moves', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    renderShell({ onSave });
    await new Promise((r) => setTimeout(r, 80));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('replaces the Save button with a save-state line', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { edit } = renderShell({ onSave });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(footerClose()).toBeInTheDocument();

    edit();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  // Nothing is waiting to be discarded once the editor saves as you go, so
  // closing should not stop to ask.
  it('closes without a discard prompt', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { edit } = renderShell({ onSave, onClose, delayMs: 5000 });

    edit();
    await userEvent.click(footerClose());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(showConfirm).not.toHaveBeenCalled();
    // Closing flushes the write the quiet period had not reached yet.
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('asks before closing when the last write failed', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn(
      (): Promise<void> => Promise.reject(new Error('offline'))
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { edit } = renderShell({ onSave, onClose });

    edit();
    await waitFor(() =>
      expect(screen.getByText('Couldn\u2019t save')).toBeInTheDocument()
    );
    await userEvent.click(footerClose());
    await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('retries a failed write from the footer', async () => {
    const onSave = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { edit } = renderShell({ onSave });

    edit();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  it('shows what is still missing without blocking the write', async () => {
    const onSave = vi.fn((): Promise<void> => Promise.resolve());
    const { edit } = renderShell({
      onSave,
      incompleteNotice: 'Question 2: correct answer is required',
    });
    expect(
      screen.getByText(
        'Not ready to use yet: Question 2: correct answer is required'
      )
    ).toBeInTheDocument();

    edit();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});
