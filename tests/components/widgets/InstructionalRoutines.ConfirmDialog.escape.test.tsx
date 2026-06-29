import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ConfirmDialog } from '@/components/widgets/InstructionalRoutines/ConfirmDialog';

afterEach(cleanup);

// autoFocus on Cancel ensures focus moves inside the dialog on open so the
// capture-phase Escape listener (scoped to the dialog element) can fire.
// Without it, if focus stays outside the portal, the listener never sees Escape.
describe('InstructionalRoutines ConfirmDialog — autoFocus', () => {
  it('moves focus to the Cancel button on open so the Escape capture listener fires', () => {
    render(
      <ConfirmDialog
        title="Test"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(cancel).toHaveFocus();
  });
});

describe('InstructionalRoutines ConfirmDialog — Escape key', () => {
  it('calls preventDefault on Escape so the browser native action (e.g. fullscreen exit) is suppressed', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        title="Test confirm"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByRole('dialog');

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    dialog.dispatchEvent(event);

    // preventDefault must be called so the browser skips native Escape handling
    expect(event.defaultPrevented).toBe(true);
    // onCancel must also fire
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
