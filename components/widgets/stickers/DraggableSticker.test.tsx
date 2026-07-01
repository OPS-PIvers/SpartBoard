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

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
    removeWidget: mockRemoveWidget,
    bringToFront: mockBringToFront,
    moveWidgetLayer: mockMoveWidgetLayer,
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
    expect(deleteButton).toBeDisabled();

    // Clicking the disabled/guarded Delete must not remove the widget.
    fireEvent.click(deleteButton);
    expect(mockRemoveWidget).not.toHaveBeenCalled();
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

    // A pointer-move drag must not reposition a locked sticker.
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 500,
          clientY: 500,
        })
      );
    });
    expect(mockUpdateWidget).not.toHaveBeenCalled();
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
