/**
 * Regression test: ShortLinkQuickCreate (the "Shorten a URL" quick-action
 * modal opened from the Sidebar) is a hand-rolled `fixed inset-0` overlay
 * with its own `document`-level Escape handler — it never uses the shared
 * `Modal` component, so `useHasOpenModal()` (which DashboardView's global
 * `window`-level Escape handler checks to bail out) never registers it as
 * open. Because the handler also never calls `stopPropagation()`, pressing
 * Escape while the quick-create modal is open both closes the modal AND
 * bubbles up to `window`, where DashboardView's handler fires its own
 * Escape behavior (closing/minimizing the topmost widget, exiting
 * group-build mode) on the dashboard underneath.
 *
 * FIX: mirror the same fix already applied to WidgetLibrary, ToolDockItem,
 * ClassRosterMenu, RemoteControlMenu, ActiveClassChip, and
 * FolderPickerPopover — stop propagation once this modal handles Escape.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/useShortLinks', () => ({
  useShortLinks: () => ({ createShortLink: vi.fn() }),
}));

import { ShortLinkQuickCreate } from '@/components/admin/ShortLinkQuickCreate';

afterEach(cleanup);

describe('ShortLinkQuickCreate — Escape does not leak to window-level handlers', () => {
  it('closes on Escape and stops propagation before it reaches window listeners', () => {
    const onClose = vi.fn();
    render(<ShortLinkQuickCreate onClose={onClose} />);

    expect(screen.getByText('Shorten a URL')).toBeInTheDocument();

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
