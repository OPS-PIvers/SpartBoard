import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PageStrip } from './PageStrip';

/**
 * Regression: PageStrip's "manage pages" popover is portalled to
 * document.body, outside any `.widget` DraggableWindow ancestor. Its Escape
 * handler closed the popover but never called stopPropagation(), so the
 * keydown kept bubbling to DashboardView's global window-level Escape
 * handler, which falls back to minimizing the topmost z-index widget. Net
 * effect: dismissing the pages popover with Escape could also silently
 * minimize an unrelated widget on the live board.
 *
 * FIX: the handler now calls event.stopPropagation() before closing,
 * matching the same fix already applied to ActiveClassChip and other
 * portalled popovers for this exact bug class.
 */
const makePages = () => [
  { id: 'p1', objects: [], title: 'Page 1' },
  { id: 'p2', objects: [], title: 'Page 2' },
];

const baseProps = {
  currentPage: 0,
  onSelectPage: vi.fn(),
  onAddPage: vi.fn(),
  onDeletePage: vi.fn(),
  onRenamePage: vi.fn(),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('PageStrip popover — Escape does not leak to window-level handlers', () => {
  it('closes the pages popover on Escape and stops propagation before it reaches window listeners', () => {
    render(<PageStrip pages={makePages()} {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /manage pages/i }));
    expect(screen.getByTestId('drawing-page-popover')).toBeInTheDocument();

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      });

      expect(
        screen.queryByTestId('drawing-page-popover')
      ).not.toBeInTheDocument();
      // This is the crux of the regression: DashboardView's global Escape
      // handler is a window-level `keydown` listener. If the popover's own
      // handler doesn't stopPropagation, the event still reaches window
      // and DashboardView falls back to minimizing the topmost widget.
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
