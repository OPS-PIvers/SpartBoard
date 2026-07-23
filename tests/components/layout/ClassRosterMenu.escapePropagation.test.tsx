/**
 * Regression test: ClassRosterMenu's Escape handler already closed the
 * menu, but never called stopPropagation(). Because the menu is portalled
 * outside any `.widget` DraggableWindow, the unhandled keydown continued
 * bubbling up to DashboardView's global `window`-level Escape handler,
 * which — finding no typing field and no `.widget` ancestor for the menu —
 * falls back to targeting the topmost z-index widget and minimizes it.
 * Net effect: dismissing this menu with Escape could also silently
 * minimize an unrelated widget on the live board.
 *
 * FIX: the handler now calls event.stopPropagation() before invoking
 * onClose(), matching the same fix applied to ToolDockItem and
 * RemoteControlMenu.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    rosters: [{ id: 'r1', name: 'Period 1' }],
    activeRosterId: null,
    setActiveRoster: vi.fn(),
  }),
}));

import ClassRosterMenu from '@/components/layout/ClassRosterMenu';

afterEach(cleanup);

const anchorRect = {
  left: 10,
  right: 50,
  top: 10,
  bottom: 40,
  width: 40,
  height: 30,
} as DOMRect;

describe('ClassRosterMenu — Escape does not leak to window-level handlers', () => {
  it('closes on Escape and stops propagation before it reaches window listeners', () => {
    const onClose = vi.fn();
    render(
      <ClassRosterMenu
        onClose={onClose}
        onOpenFullEditor={vi.fn()}
        anchorRect={anchorRect}
      />
    );

    expect(
      screen.getByRole('dialog', { name: /class selection menu/i })
    ).toBeInTheDocument();

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      expect(onClose).toHaveBeenCalled();
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
