import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { PromptDialog } from '@/components/widgets/InstructionalRoutines/PromptDialog';

afterEach(cleanup);

describe('InstructionalRoutines PromptDialog — Escape key', () => {
  it('calls preventDefault on Escape so the browser native action (e.g. fullscreen exit) is suppressed', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <PromptDialog
        title="Test prompt"
        message="Enter a value"
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
