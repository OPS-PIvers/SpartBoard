// Regression: AssignmentFilterSelect's Escape handling lives on a React
// onKeyDown bound to the popover's wrapper div, which only fires when the
// browser's focus happens to be inside that div. Opening the dropdown never
// moves focus there (no autoFocus/`.focus()` call — a mouse click on the
// trigger button does not focus it in every browser, e.g. Safari), so an
// Escape pressed right after opening it bubbles straight past this
// component to the Assignments Hub's own document-level Escape handler and
// closes the whole hub instead of just the filter dropdown. Same bug class
// already fixed elsewhere (ToolDockItem, RemoteControlMenu, ClassRosterMenu,
// OverflowMenu, ActiveClassChip, AIGeneratorOverlay) but reintroduced here.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AssignmentFilterSelect } from '@/components/assignmentsHub/AssignmentFilterSelect';

afterEach(cleanup);

const OPTIONS = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'video-activity', label: 'Video Activity' },
];

function renderWithHubEscapeHandler(onHubClose: () => void) {
  // Stand-in for AssignmentsHubModal's own document-level Escape handler,
  // which mounts unconditionally as soon as the hub opens — i.e. always
  // BEFORE any filter dropdown inside it is ever opened.
  const handleHubEscape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    onHubClose();
  };
  document.addEventListener('keydown', handleHubEscape);

  const onChange = vi.fn();
  render(
    <AssignmentFilterSelect
      label="Filter by type"
      summary="All types"
      options={OPTIONS}
      selected={[]}
      onChange={onChange}
      allLabel="All types"
    />
  );

  return () => document.removeEventListener('keydown', handleHubEscape);
}

describe('AssignmentFilterSelect — Escape dismissal', () => {
  it('closes only the dropdown on Escape, without closing the hub', () => {
    const onHubClose = vi.fn();
    const cleanupListener = renderWithHubEscapeHandler(onHubClose);

    try {
      // Opening via click does not move browser focus into the popover in
      // every browser — same assumption the FolderItem regression test
      // makes (fireEvent.click never focuses in jsdom either).
      fireEvent.click(screen.getByRole('button', { name: 'Filter by type' }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onHubClose).not.toHaveBeenCalled();
    } finally {
      cleanupListener();
    }
  });
});
