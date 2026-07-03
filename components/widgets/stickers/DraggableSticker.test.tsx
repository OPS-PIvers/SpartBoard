import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DraggableSticker } from './DraggableSticker';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { WidgetData } from '@/types';

// Mock dependencies
const mockUpdateWidget = vi.fn();
const mockRemoveWidget = vi.fn();
const mockBringToFront = vi.fn();
const mockMoveWidgetLayer = vi.fn();
const mockDeleteAllWidgets = vi.fn();
// Mutable so individual tests can exercise the read-only board path; reset in
// beforeEach. `mock`-prefixed so it's usable inside vi.mock's hoisted factory.
let mockIsActiveBoardReadOnly = false;

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
    removeWidget: mockRemoveWidget,
    bringToFront: mockBringToFront,
    moveWidgetLayer: mockMoveWidgetLayer,
    deleteAllWidgets: mockDeleteAllWidgets,
    isActiveBoardReadOnly: mockIsActiveBoardReadOnly,
  }),
}));

vi.mock('@/hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

describe('DraggableSticker', () => {
  const mockWidget: WidgetData = {
    id: 'sticker-1',
    type: 'sticker',
    x: 100,
    y: 100,
    w: 200,
    h: 200,
    z: 1,
    flipped: false,
    config: {
      url: 'test.png',
      rotation: 0,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActiveBoardReadOnly = false;
  });

  it('shows resize and rotate handles immediately when selected', () => {
    render(
      <DraggableSticker widget={mockWidget}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const sticker = screen.getByText('Sticker Content').closest('.absolute');
    if (!sticker) throw new Error('Sticker not found');

    // Select the sticker
    fireEvent(
      sticker,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );

    // Verify resize handle (corner)
    const resizeHandle = sticker.querySelector('.cursor-nwse-resize');
    expect(resizeHandle).toBeInTheDocument();

    // Verify rotate handle (top)
    const rotateHandle = sticker.querySelector('.cursor-grab');
    expect(rotateHandle).toBeInTheDocument();
  });

  it('shows the 3-dots menu button when selected and opens menu on click', () => {
    render(
      <DraggableSticker widget={mockWidget}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const sticker = screen.getByText('Sticker Content').closest('.absolute');
    if (!sticker) throw new Error('Sticker not found');

    // Select sticker
    fireEvent(
      sticker,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );

    // Find 3-dots menu button by title
    const menuButton = screen.getByTitle('Sticker Options');
    expect(menuButton).toBeInTheDocument();

    // Menu should not be open yet (options not visible)
    expect(screen.queryByText('Bring Forward')).not.toBeInTheDocument();

    // Click menu button
    fireEvent.click(menuButton);

    // Now options should be visible
    expect(screen.getByText('Bring Forward')).toBeInTheDocument();
    expect(screen.getByText('Send Backward')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();

    // Test delete action
    fireEvent.click(screen.getByText('Delete'));
    expect(mockRemoveWidget).toHaveBeenCalledWith('sticker-1');
  });

  it('disables the menu Delete button when the sticker is locked', () => {
    render(
      <DraggableSticker widget={{ ...mockWidget, isLocked: true }}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const sticker = screen.getByText('Sticker Content').closest('.absolute');
    if (!sticker) throw new Error('Sticker not found');

    // Select sticker and open the menu
    fireEvent(
      sticker,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );
    fireEvent.click(screen.getByTitle('Sticker Options'));

    const deleteButton = screen.getByText('Delete').closest('button');
    if (!deleteButton) throw new Error('Delete button not found');
    expect(deleteButton).toHaveAttribute('aria-disabled', 'true');

    // Clicking the inert Delete must not remove the widget, but must still
    // close the menu (the inline guard runs setShowMenu(false) regardless).
    fireEvent.click(deleteButton);
    expect(mockRemoveWidget).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('hides rotate/resize handles and blocks dragging when locked', () => {
    render(
      <DraggableSticker widget={{ ...mockWidget, isLocked: true }}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const sticker = screen.getByText('Sticker Content').closest('.absolute');
    if (!sticker) throw new Error('Sticker not found');

    // Selecting a locked sticker still reveals the menu button...
    fireEvent(
      sticker,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );
    expect(screen.getByTitle('Sticker Options')).toBeInTheDocument();

    // ...but the rotate/resize handles are not rendered.
    expect(sticker.querySelector('.cursor-grab')).not.toBeInTheDocument();
    expect(
      sticker.querySelector('.cursor-nwse-resize')
    ).not.toBeInTheDocument();

    // A locked sticker must not be brought to front (an unguarded write) on
    // select — this is the synchronously-observable proof the drag guard ran.
    expect(mockBringToFront).not.toHaveBeenCalled();

    // The drag guard returns before the pointermove listener is registered, so
    // a dispatched move reaches nothing — assert bringToFront is STILL not
    // called afterwards, confirming the listener was never wired up.
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 500,
          clientY: 500,
        })
      );
    });
    expect(mockBringToFront).not.toHaveBeenCalled();
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('disables the layer buttons when the sticker is locked', () => {
    render(
      <DraggableSticker widget={{ ...mockWidget, isLocked: true }}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const sticker = screen.getByText('Sticker Content').closest('.absolute');
    if (!sticker) throw new Error('Sticker not found');

    fireEvent(
      sticker,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );
    fireEvent.click(screen.getByTitle('Sticker Options'));

    const forward = screen.getByText('Bring Forward').closest('button');
    const backward = screen.getByText('Send Backward').closest('button');
    expect(forward).toHaveAttribute('aria-disabled', 'true');
    expect(backward).toHaveAttribute('aria-disabled', 'true');

    // Clicking an inert layer button must not write a z-order change, but must
    // still close the menu. (Clicking one closes the menu, so assert on one.)
    if (!forward) throw new Error('Bring Forward not found');
    fireEvent.click(forward);
    expect(mockMoveWidgetLayer).not.toHaveBeenCalled();
    expect(screen.queryByText('Bring Forward')).not.toBeInTheDocument();
  });

  it('performs no mutating writes when a sticker is selected on a read-only board', () => {
    mockIsActiveBoardReadOnly = true;
    render(
      <DraggableSticker widget={mockWidget}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const sticker = screen.getByText('Sticker Content').closest('.absolute');
    if (!sticker) throw new Error('Sticker not found');

    fireEvent(
      sticker,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );

    // Selectable (menu button visible), handles hidden, and — critically — no
    // bringToFront/updateWidget write is issued against the read-only board.
    expect(screen.getByTitle('Sticker Options')).toBeInTheDocument();
    expect(sticker.querySelector('.cursor-grab')).not.toBeInTheDocument();
    expect(
      sticker.querySelector('.cursor-nwse-resize')
    ).not.toBeInTheDocument();
    expect(mockBringToFront).not.toHaveBeenCalled();
    expect(mockUpdateWidget).not.toHaveBeenCalled();

    // The context menu must also reflect the read-only state — this exercises
    // the `isActiveBoardReadOnly` branch of the inline lock guard specifically,
    // which the `widget.isLocked` tests above don't cover.
    fireEvent.click(screen.getByTitle('Sticker Options'));
    const deleteButton = screen.getByText('Delete').closest('button');
    const forward = screen.getByText('Bring Forward').closest('button');
    const backward = screen.getByText('Send Backward').closest('button');
    expect(deleteButton).toHaveAttribute('aria-disabled', 'true');
    expect(forward).toHaveAttribute('aria-disabled', 'true');
    expect(backward).toHaveAttribute('aria-disabled', 'true');

    // Clicking Delete closes the menu but issues no write.
    if (!deleteButton) throw new Error('Delete button not found');
    fireEvent.click(deleteButton);
    expect(mockRemoveWidget).not.toHaveBeenCalled();
    expect(mockMoveWidgetLayer).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  // Regression: handleRotateStart / handleResizeStart register their window
  // listeners with cleanupRef so the unmount effect tears them down if the
  // component unmounts mid-gesture (dashboard switch / remote delete).
  it.each([
    ['rotate', '.cursor-grab'],
    ['resize', '.cursor-nwse-resize'],
  ])('removes %s-gesture window listeners on unmount mid-gesture', (_, sel) => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <DraggableSticker widget={mockWidget}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );
    const sticker = screen.getByText('Sticker Content').closest('.absolute');
    if (!sticker) throw new Error('Sticker not found');

    // Select the sticker (and end the incidental drag) so handles render.
    fireEvent(
      sticker,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });

    const handle = sticker.querySelector(sel);
    if (!handle) throw new Error(`${sel} handle not found`);

    addSpy.mockClear();
    // Start the gesture — registers pointermove/up/cancel on window.
    fireEvent(
      handle,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );
    const moveHandler = addSpy.mock.calls.find(
      (c) => c[0] === 'pointermove'
    )?.[1];
    expect(moveHandler).toBeTruthy();

    removeSpy.mockClear();
    // Unmount mid-gesture — the cleanup effect must remove the listeners.
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('pointermove', moveHandler);
  });

  it('deselects sticker on widget-escape-press event', () => {
    render(
      <DraggableSticker widget={mockWidget}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const sticker = screen.getByText('Sticker Content').closest('.absolute');
    if (!sticker) throw new Error('Sticker not found');

    // Select the sticker first
    fireEvent(
      sticker,
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    );

    const event = new CustomEvent('widget-escape-press', {
      detail: { widgetId: 'sticker-1' },
    });
    act(() => {
      window.dispatchEvent(event);
    });

    // Should not remove widget, should just close selection
    expect(mockRemoveWidget).not.toHaveBeenCalled();
    // Verify rotate handle is gone
    const rotateHandle = sticker.querySelector('.cursor-grab');
    expect(rotateHandle).not.toBeInTheDocument();
  });

  it('removes sticker on widget-keyboard-action Delete event', () => {
    render(
      <DraggableSticker widget={mockWidget}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const event = new CustomEvent('widget-keyboard-action', {
      detail: { widgetId: 'sticker-1', key: 'Delete', shiftKey: false },
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(mockRemoveWidget).toHaveBeenCalledWith('sticker-1');
  });

  it('does not remove sticker on widget-escape-press for a different ID', () => {
    render(
      <DraggableSticker widget={mockWidget}>
        <div>Sticker Content</div>
      </DraggableSticker>
    );

    const event = new CustomEvent('widget-escape-press', {
      detail: { widgetId: 'other-sticker' },
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(mockRemoveWidget).not.toHaveBeenCalled();
  });
});
