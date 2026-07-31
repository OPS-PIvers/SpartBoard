import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';

describe('OverflowMenu', () => {
  it('opens on click and shows items', () => {
    render(<OverflowMenu items={[{ label: 'Export', onClick: vi.fn() }]} />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Export' })
    ).toBeInTheDocument();
  });

  it('fires the item onClick and closes', () => {
    const onClick = vi.fn();
    render(<OverflowMenu items={[{ label: 'Export', onClick }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Tab and returns focus to the trigger', () => {
    render(<OverflowMenu items={[{ label: 'Export', onClick: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<OverflowMenu items={[{ label: 'Export', onClick: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  // Regression test for a missing-stopPropagation bug: the menu is portalled
  // to document.body (outside any `.widget` DraggableWindow ancestor), so an
  // unstopped Escape here bubbles all the way to DashboardView's global
  // window-level Escape handler. That handler finds no `.widget` ancestor for
  // the portalled menu item and falls back to targeting the topmost z-index
  // widget on the board, silently minimizing an unrelated widget (e.g. a
  // running timer) just because the user dismissed this menu. This mirrors
  // the same bug class already fixed in ToolDockItem/RemoteControlMenu/
  // ClassRosterMenu (#2266) and BoardNavFab/CollectionSwitcherMenu/
  // BoardActionsFab (#2289) — see tests/components/layout/ToolDockItem.test.tsx.
  it('does not leak the Escape keydown to window-level listeners (would otherwise let DashboardView minimize an unrelated widget)', () => {
    render(<OverflowMenu items={[{ label: 'Export', onClick: vi.fn() }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Stand-in for DashboardView's `window.addEventListener('keydown', ...)`
    // global handler.
    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(screen.getByRole('menu'), {
        key: 'Escape',
        bubbles: true,
      });
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });

  it('focuses the first item on open and navigates with Arrow keys', () => {
    render(
      <OverflowMenu
        items={[
          { label: 'A', onClick: vi.fn() },
          { label: 'B', onClick: vi.fn() },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'B' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus();
  });

  it('renders a spinner for a loading item', () => {
    render(
      <OverflowMenu
        items={[{ label: 'Export', loading: true, onClick: vi.fn() }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    // Menu is portalled to document.body, so query the document, not container.
    expect(document.querySelector('.animate-spin')).not.toBeNull();
    // A loading item is aria-disabled (stays focusable/announced) and its
    // onClick is guarded so it can't double-fire.
    expect(screen.getByRole('menuitem', { name: 'Export' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
