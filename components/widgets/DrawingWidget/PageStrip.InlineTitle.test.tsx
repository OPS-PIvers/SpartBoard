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
  it('FAIL-BEFORE / PASS-AFTER: Escape + synchronous blur must NOT commit the edited text', () => {
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
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    // The rename must NOT have been committed.
    expect(onRenamePage).not.toHaveBeenCalled();
  });

  it('calls onRenamePage with edited text on plain blur (normal commit path)', () => {
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

    act(() => {
      fireEvent.blur(input);
    });

    expect(onRenamePage).toHaveBeenCalledWith(0, 'New Name');
  });

  it('calls onRenamePage with edited text on Enter (normal commit path)', () => {
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

    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(onRenamePage).toHaveBeenCalledWith(0, 'Enter Name');
  });
});

// Regression (#2429 round-2 review): the popover's dismiss-on-Escape handler
// (a React onKeyDown on the popover element itself, see PageStrip.tsx), while
// InlineTitle cancels a rename from its own React synthetic `onKeyDown` that
// calls `e.stopPropagation()`. The concern raised in review was that Escape
// would bubble past the rename input and also close the whole popover when
// the user only meant to cancel the rename.
//
// It does not, and these tests pin that. InlineTitle's own `stopPropagation()`
// stops the bubble before it can reach the popover's onKeyDown.
//
// This is load-bearing: if InlineTitle's `stopPropagation()` is ever removed
// (it also exists to stop the widget wrapper's Backspace/Delete/arrow nudge
// handlers), Escape-to-cancel-rename would start tearing down the whole
// popover. These tests fail in that case.
describe('InlineTitle (via PageStrip) — Escape-cancel does not dismiss the popover', () => {
  const multiPages = [
    { id: 'p1', objects: [], title: 'Page 1' },
    { id: 'p2', objects: [], title: 'Page 2' },
  ];

  const openPopoverAndEditRow = (
    onRenamePage: (index: number, title: string) => void
  ) => {
    render(
      <PageStrip
        pages={multiPages}
        onRenamePage={onRenamePage}
        {...baseProps}
      />
    );
    // Open the pages popover (portalled to document.body).
    fireEvent.click(screen.getByRole('button', { name: /manage pages/i }));
    expect(screen.getByTestId('drawing-page-popover')).toBeInTheDocument();

    // Enter row-edit mode for page 2, which mounts an InlineTitle input
    // INSIDE the portal.
    fireEvent.click(screen.getByRole('button', { name: /rename page 2/i }));
    return screen.getByRole('textbox', { name: /page title/i });
  };

  it('keeps the popover open when Escape cancels an in-popover rename', () => {
    const onRenamePage = vi.fn();
    const input = openPopoverAndEditRow(onRenamePage);

    fireEvent.change(input, { target: { value: 'Discarded' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });

    // The rename is cancelled...
    expect(onRenamePage).not.toHaveBeenCalled();
    // ...and the popover is still open — Escape did not reach the
    // document-level dismiss handler.
    expect(screen.getByTestId('drawing-page-popover')).toBeInTheDocument();
    // Edit mode exited, so the row renders its static label again.
    expect(
      screen.queryByRole('textbox', { name: /page title/i })
    ).not.toBeInTheDocument();
  });

  it('still dismisses the popover on Escape when no rename is in progress', () => {
    // Complement to the test above: the popover's own onKeyDown must remain
    // functional for Escape presses that do NOT originate inside a rename
    // input, otherwise "the popover never closes" would pass the test above
    // for the wrong reason.
    render(
      <PageStrip pages={multiPages} onRenamePage={vi.fn()} {...baseProps} />
    );
    fireEvent.click(screen.getByRole('button', { name: /manage pages/i }));
    const popover = screen.getByTestId('drawing-page-popover');

    act(() => {
      fireEvent.keyDown(popover, { key: 'Escape' });
    });

    expect(
      screen.queryByTestId('drawing-page-popover')
    ).not.toBeInTheDocument();
  });
});
