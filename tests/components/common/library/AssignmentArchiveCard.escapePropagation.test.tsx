/**
 * Regression test: AssignmentArchiveCard's overflow menu (kebab →
 * OverflowMenu) is portalled to document.body, outside any `.widget`
 * DraggableWindow ancestor, but never listened for Escape at all. Pressing
 * Escape while the menu is open left it open AND let the keydown bubble to
 * DashboardView's global window-level Escape handler, which — finding no
 * typing field and no `.widget` ancestor for the portal — falls back to
 * targeting the topmost z-index widget and minimizes it. Net effect:
 * dismissing this menu (used by the Quiz / Video Activity / Mini App
 * in-progress and archive rows) with Escape could silently minimize an
 * unrelated widget on the live board.
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
import { AssignmentArchiveCard } from '@/components/common/library/AssignmentArchiveCard';
import type {
  AssignmentStatusBadge,
  LibraryMenuAction,
} from '@/components/common/library/types';

interface Assignment {
  id: string;
  quizTitle: string;
}

const ASSIGNMENT: Assignment = { id: 'a1', quizTitle: 'My Quiz' };

const LIVE_STATUS: AssignmentStatusBadge = {
  label: 'Live',
  tone: 'success',
  dot: true,
};

afterEach(cleanup);

describe('AssignmentArchiveCard overflow menu — Escape does not leak to window-level handlers', () => {
  it('closes the menu on Escape and stops propagation before it reaches window listeners', () => {
    const secondary: LibraryMenuAction[] = [
      { id: 'delete', label: 'Delete', onClick: vi.fn() },
    ];

    render(
      <AssignmentArchiveCard<Assignment>
        assignment={ASSIGNMENT}
        mode="active"
        status={LIVE_STATUS}
        title={ASSIGNMENT.quizTitle}
        secondaryActions={secondary}
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
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
