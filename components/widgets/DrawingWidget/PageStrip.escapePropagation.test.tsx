import React from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PageStrip } from './PageStrip';

// Regression: a `document`-level Escape listener never fires inside a
// DraggableWindow, which stops the native event first (same class as #2544).
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
    const popover = screen.getByTestId('drawing-page-popover');

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      // Escape fires on the popover itself, which now holds DOM focus after
      // opening — a real bubble path, not a synthetic dispatch on `document`.
      act(() => {
        fireEvent.keyDown(popover, { key: 'Escape' });
      });

      expect(
        screen.queryByTestId('drawing-page-popover')
      ).not.toBeInTheDocument();
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });

  it('FAIL-BEFORE / PASS-AFTER: closes the popover (not the widget) even though DraggableWindow steals focus to its own root on pointerdown', () => {
    // Mimics DraggableWindow.handlePointerDown (focuses its own root on every
    // pointerdown inside the widget) and DraggableWindow.handleKeyDown's
    // Escape branch (preventDefault + stopPropagation, then "minimize").
    const ancestorMinimize = vi.fn();

    function GlassCardLike({ children }: { children: ReactNode }) {
      const handlePointerDown = (e: ReactPointerEvent) => {
        const targetEl = e.target instanceof Element ? e.target : null;
        if (!targetEl?.closest('[role="dialog"], [role="menu"]')) {
          (e.currentTarget as HTMLElement).focus();
        }
      };
      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          ancestorMinimize();
        }
      };
      return (
        <div
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
        >
          {children}
        </div>
      );
    }

    render(
      <GlassCardLike>
        <PageStrip pages={makePages()} {...baseProps} />
      </GlassCardLike>
    );

    const trigger = screen.getByRole('button', { name: /manage pages/i });
    // A real click is pointerdown THEN click — the pointerdown is what
    // steals focus onto the ancestor before the popover even opens.
    act(() => {
      fireEvent.pointerDown(trigger);
      fireEvent.click(trigger);
    });

    expect(screen.getByTestId('drawing-page-popover')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document.activeElement as Element, {
        key: 'Escape',
      });
    });

    expect(
      screen.queryByTestId('drawing-page-popover')
    ).not.toBeInTheDocument();
    expect(ancestorMinimize).not.toHaveBeenCalled();
  });
});
