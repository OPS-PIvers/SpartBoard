// Regression: Escape in the filter dropdown was closing the whole Assignments Hub instead (focus-fragility bug class).

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
  // Stand-in for AssignmentsHubModal's own document-level Escape handler, mounted before the dropdown opens.
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
      // fireEvent.click never focuses in jsdom, matching real-browser click-doesn't-focus behavior.
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
