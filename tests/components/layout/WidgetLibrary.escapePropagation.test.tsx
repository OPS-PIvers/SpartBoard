/**
 * Regression test: WidgetLibrary (the "Add Widget" library overlay opened
 * from the Dock) is portalled to document.body but has NO Escape-key
 * handler at all — only useClickOutside. Because it never uses the shared
 * `Modal` component, `useHasOpenModal()` (which DashboardView's global
 * Escape handler checks to bail out) never registers it as open. Pressing
 * Escape while the library is open therefore falls through to
 * DashboardView's global `window`-level Escape handler, which — finding no
 * typing field and no `.widget` ancestor for the library overlay — falls
 * back to targeting the topmost z-index widget on the board and
 * closing/minimizing it, all while the library overlay stays open and
 * unaffected.
 *
 * FIX: WidgetLibrary now closes itself on Escape and calls
 * stopPropagation(), matching the same fix already applied to
 * ToolDockItem, ClassRosterMenu, RemoteControlMenu, ActiveClassChip, and
 * FolderPickerPopover.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/context/useToolVisibility', () => ({
  useToolVisibility: () => ({
    resetDockToDefaults: vi.fn(),
    hiddenTools: [],
    toggleToolHidden: vi.fn(),
  }),
}));

import { WidgetLibrary } from '@/components/layout/dock/WidgetLibrary';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

afterEach(cleanup);

describe('WidgetLibrary — Escape does not leak to window-level handlers', () => {
  it('closes on Escape and stops propagation before it reaches window listeners', () => {
    const onClose = vi.fn();
    render(
      <WidgetLibrary
        onToggle={vi.fn()}
        visibleTools={[]}
        canAccess={() => true}
        onClose={onClose}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        libraryOrder={[]}
        onReorderLibrary={vi.fn()}
      />
    );

    expect(screen.getByText('Widget Library')).toBeInTheDocument();

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
