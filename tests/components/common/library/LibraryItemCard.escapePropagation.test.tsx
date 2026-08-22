/**
 * Regression test: LibraryItemCard's overflow menu (kebab → OverflowMenu)
 * is portalled to document.body, outside any `.widget` DraggableWindow
 * ancestor, but never listened for Escape at all. Pressing Escape while the
 * menu is open left it open AND let the keydown bubble to DashboardView's
 * global window-level Escape handler, which — finding no typing field and no
 * `.widget` ancestor for the portal — falls back to targeting the topmost
 * z-index widget and minimizes it. Net effect: dismissing this menu (used by
 * the Quiz / Video Activity / Guided Learning / Mini App library managers)
 * with Escape could silently minimize an unrelated widget on the live board.
 *
 * FIX: the menu now listens for Escape while open, calls
 * event.stopPropagation() before closing, matching the same fix already
 * applied to ToolDockItem, RemoteControlMenu, ClassRosterMenu, OverflowMenu,
 * and FolderPickerPopover for this exact bug class.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from '@testing-library/react';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';

afterEach(cleanup);

describe('LibraryItemCard overflow menu — Escape does not leak to window-level handlers', () => {
  it('closes the menu on Escape and stops propagation before it reaches window listeners', () => {
    const onDelete = vi.fn();

    render(
      <LibraryItemCard
        id="card-1"
        title="Test card"
        sortable={false}
        secondaryActions={[
          { id: 'delete', label: 'Delete', onClick: onDelete },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
          })
        );
      });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      // This is the crux of the regression: DashboardView's global Escape
      // handler is a window-level `keydown` listener. If the menu's own
      // handler doesn't stopPropagation, the event still reaches window
      // and DashboardView falls back to minimizing the topmost widget.
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
