/**
 * Regression test: ActiveClassChip's Escape handler already closed the
 * switch-class popover, but never called stopPropagation(). Because the
 * popover is portalled to document.body outside any `.widget` DraggableWindow
 * ancestor, the unhandled keydown continued bubbling up to DashboardView's
 * global `window`-level Escape handler, which — finding no typing field and
 * no `.widget` ancestor for the popover — falls back to targeting the
 * topmost z-index widget and minimizes it. Net effect: dismissing this
 * popover with Escape (e.g. from the Random / SeatingChart / LunchCount /
 * Stations widgets) could also silently minimize an unrelated widget on the
 * live board.
 *
 * FIX: the handler now calls event.stopPropagation() before invoking
 * closeMenu(), matching the same fix already applied to ToolDockItem,
 * RemoteControlMenu, ClassRosterMenu, and OverflowMenu for this exact bug
 * class.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActiveClassChip } from '@/components/common/ActiveClassChip';
import { useDashboard } from '@/context/useDashboard';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

afterEach(cleanup);

const makeRoster = (id: string, name: string, studentCount = 20) => ({
  id,
  name,
  driveFileId: null,
  studentCount,
  createdAt: 0,
  students: [],
});

describe('ActiveClassChip — Escape does not leak to window-level handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      rosters: [makeRoster('r1', 'Period 1'), makeRoster('r2', 'Period 2')],
      activeRosterId: 'r1',
      setActiveRoster: vi.fn(),
    });
  });

  it('closes the popover on Escape and stops propagation before it reaches window listeners', () => {
    render(<ActiveClassChip />);

    fireEvent.click(screen.getByRole('button', { name: /active class/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
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
