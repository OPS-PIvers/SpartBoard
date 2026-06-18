import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PageStrip } from './PageStrip';

// Minimal DrawingPage fixture — only id, objects, and title are needed.
const makePages = (title = 'Page 1') => [{ id: 'p1', objects: [], title }];

const baseProps = {
  currentPage: 0,
  onSelectPage: vi.fn(),
  onAddPage: vi.fn(),
  onDeletePage: vi.fn(),
};

describe('InlineTitle (via PageStrip) — Escape-cancel stale onBlur guard', () => {
  it('FAIL-BEFORE / PASS-AFTER: Escape + synchronous blur must NOT commit the edited text', async () => {
    // Root cause: cancel() calls setIsEditing(false) which unmounts the
    // focused <input>. React batches the state update; the browser fires a
    // synchronous blur event on the still-mounted input BEFORE the new state
    // commits. The onBlur=commit closure captures the pre-cancel draft and
    // calls onCommit with the cancelled text.
    // Fix: isCancellingRef set synchronously in cancel(); commit() checks it
    // and short-circuits, clearing the flag.
    const onRenamePage = vi.fn();
    const pages = makePages('Page 1');

    render(
      <PageStrip pages={pages} onRenamePage={onRenamePage} {...baseProps} />
    );

    // Click the chip button to enter edit mode.
    const renameBtn = screen.getByRole('button', { name: /rename "Page 1"/i });
    fireEvent.click(renameBtn);

    const input = screen.getByRole('textbox', { name: /page title/i });

    // Type a name the user intends to discard.
    fireEvent.change(input, { target: { value: 'Unwanted Name' } });

    // Replicate the browser's synchronous blur-during-unmount sequence.
    // Both events must be inside the SAME act() so React's flush is deferred
    // until after both have fired (jsdom does not auto-fire blur on removal).
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    // The rename must NOT have been committed.
    expect(onRenamePage).not.toHaveBeenCalled();
  });

  it('calls onRenamePage with edited text on plain blur (normal commit path)', async () => {
    const onRenamePage = vi.fn();
    render(
      <PageStrip
        pages={makePages()}
        onRenamePage={onRenamePage}
        {...baseProps}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /rename "Page 1"/i }));
    const input = screen.getByRole('textbox', { name: /page title/i });
    fireEvent.change(input, { target: { value: 'New Name' } });

    await act(async () => {
      fireEvent.blur(input);
    });

    expect(onRenamePage).toHaveBeenCalledWith(0, 'New Name');
  });

  it('calls onRenamePage with edited text on Enter (normal commit path)', async () => {
    const onRenamePage = vi.fn();
    render(
      <PageStrip
        pages={makePages()}
        onRenamePage={onRenamePage}
        {...baseProps}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /rename "Page 1"/i }));
    const input = screen.getByRole('textbox', { name: /page title/i });
    fireEvent.change(input, { target: { value: 'Enter Name' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(onRenamePage).toHaveBeenCalledWith(0, 'Enter Name');
  });
});
