/**
 * Regression test for a missing-Escape-handler bug in ToolDockItem's
 * "restore minimized widgets" popover.
 *
 * BUG: The popover (opened by clicking a dock icon that has minimized
 * widgets) only dismissed via useClickOutside — there was no Escape
 * handler, unlike every other click-to-dismiss popover in this codebase
 * (e.g. SidebarPlcs's PlcRow, FolderTree's overflow menu — see #2228).
 *
 * That absence isn't just a missing convenience: the dock lives OUTSIDE
 * any `.widget` DraggableWindow, so an unhandled Escape here bubbles all
 * the way up to DashboardView's global `window`-level Escape handler.
 * That handler finds no typing field and no `.widget` ancestor for the
 * dock button, so it falls back to targeting the topmost z-index widget
 * on the board and dispatches a 'widget-keyboard-action' Escape event —
 * which DraggableWindow's handler interprets as "minimize this widget".
 * Net effect: a teacher opens the dock's restore-widget popover, presses
 * Escape to dismiss it, and an unrelated widget on their live board
 * (e.g. a running timer) silently minimizes instead.
 *
 * FIX: ToolDockItem now closes the popover on Escape AND calls
 * `stopPropagation()`, so the keydown never reaches the window-level
 * listener that DashboardView installs.
 *
 * This test simulates that window-level listener directly (rather than
 * mounting the full DashboardView, which pulls in nearly the entire app)
 * to prove both halves of the fix: the popover closes, and the event
 * does not leak past the popover's own handler.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { ToolMetadata, WidgetData, GlobalStyle } from '@/types';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => undefined } },
}));
// DockLabel reads global dock styling from the dashboard canvas store, which
// requires a DashboardProvider ancestor. Stub it out — irrelevant to this
// Escape-dismissal regression.
vi.mock('@/context/dashboardCanvasStore', () => ({
  useGlobalStyle: () => ({
    fontFamily: 'sans',
    dockTextColor: '#ffffff',
    dockTextShadow: false,
  }),
}));

import { ToolDockItem } from '@/components/layout/dock/ToolDockItem';

afterEach(cleanup);

const tool: ToolMetadata = {
  type: 'time-tool',
  icon: () => null,
  label: 'Timer',
  color: 'bg-blue-500',
};

const globalStyle = {} as GlobalStyle;

const makeMinimizedWidget = (id: string): WidgetData =>
  ({
    id,
    type: 'time-tool',
    x: 0,
    y: 0,
    w: 300,
    h: 200,
    z: 1,
    flipped: false,
    minimized: true,
    config: {},
  }) as unknown as WidgetData;

function renderPopover(): void {
  render(
    <ToolDockItem
      tool={tool}
      minimizedWidgets={[makeMinimizedWidget('w1')]}
      onAdd={vi.fn()}
      onRestore={vi.fn()}
      onDelete={vi.fn()}
      onDeleteAll={vi.fn()}
      onRemoveFromDock={vi.fn()}
      isEditMode={false}
      onLongPress={vi.fn()}
      globalStyle={globalStyle}
    />
  );
  // The dock button toggles the "restorable" popover open since there's a
  // minimized widget for this tool.
  fireEvent.click(screen.getByRole('button', { name: /timer/i }));
}

describe('ToolDockItem — restore popover Escape dismissal', () => {
  it('closes the popover when Escape is pressed', () => {
    renderPopover();
    expect(screen.getByText('Restorable')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', bubbles: true });

    expect(screen.queryByText('Restorable')).not.toBeInTheDocument();
  });

  it('does not leak the Escape keydown to window-level listeners (would otherwise let DashboardView minimize an unrelated widget)', () => {
    renderPopover();
    expect(screen.getByText('Restorable')).toBeInTheDocument();

    // Stand-in for DashboardView's `window.addEventListener('keydown', ...)`
    // global handler, which (with nothing else to guide it) would dispatch
    // a 'widget-keyboard-action' Escape event at the topmost widget.
    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
