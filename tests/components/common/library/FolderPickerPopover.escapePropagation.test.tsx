/**
 * Regression test: FolderPickerPopover's Escape handler already called
 * onClose(), but never called stopPropagation(). Because the popover is
 * portalled to document.body (or rendered inline) outside any `.widget`
 * DraggableWindow ancestor, the unhandled keydown continued bubbling up to
 * DashboardView's global `window`-level Escape handler, which — finding no
 * typing field and no `.widget` ancestor for the popover — falls back to
 * targeting the topmost z-index widget and minimizes it. Net effect:
 * dismissing this folder picker with Escape (used from the Quiz / Video
 * Activity / Mini App / Guided Learning library managers) could also
 * silently minimize an unrelated widget on the live board.
 *
 * FIX: the handler now calls event.stopPropagation() before invoking
 * onClose(), matching the same fix already applied to ToolDockItem,
 * RemoteControlMenu, ClassRosterMenu, OverflowMenu, and ActiveClassChip for
 * this exact bug class.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';

afterEach(cleanup);

describe('FolderPickerPopover — Escape does not leak to window-level handlers', () => {
  it('closes on Escape and stops propagation before it reaches window listeners', () => {
    const onClose = vi.fn();

    render(
      <FolderPickerPopover
        folders={[]}
        selectedFolderId={null}
        onSelect={vi.fn()}
        onClose={onClose}
        variant="dialog"
      />
    );

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );

      expect(onClose).toHaveBeenCalledTimes(1);
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
