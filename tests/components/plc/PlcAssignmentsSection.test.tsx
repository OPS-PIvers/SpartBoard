/**
 * Tests for PlcAssignmentsSection — Stream B task B6.
 *
 * Key assertions:
 *   - Renders "Create Quiz" and "Create Video" buttons in Library sub-tab.
 *   - Clicking "Create Quiz" opens PlcAuthorQuizModal (no board hand-off).
 *   - Clicking "Create Video" opens PlcAuthorVideoActivityModal.
 *   - The three sub-tab tabs render (Library / In-progress / Completed).
 *   - Switching sub-tabs swaps the body.
 *   - No onCloseDashboard prop — board hand-off is removed.
 *
 * Mocking strategy:
 *   - Sub-tab bodies and authoring modals are mocked as sentinels.
 *   - react-i18next mocked so defaultValue is returned.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { PlcAssignmentsSection } from '@/components/plc/assignments/PlcAssignmentsSection';
import type { Plc } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

// Mock the sub-tab bodies so the test is fast and deterministic
vi.mock('@/components/plc/tabs/PlcAssignmentsLibrarySubTab', () => ({
  PlcAssignmentsLibrarySubTab: vi.fn(
    ({
      onNewQuizAssignment,
      onNewVideoActivityAssignment,
    }: {
      onNewQuizAssignment?: () => void;
      onNewVideoActivityAssignment?: () => void;
      plc?: unknown;
      onCloseDashboard?: () => void;
    }) => (
      <div data-testid="library-sub-tab">
        <button onClick={onNewQuizAssignment}>Open Create Quiz</button>
        <button onClick={onNewVideoActivityAssignment}>
          Open Create Video
        </button>
      </div>
    )
  ),
}));

vi.mock('@/components/plc/tabs/PlcAssignmentsInProgressSubTab', () => ({
  PlcAssignmentsInProgressSubTab: vi.fn(() => (
    <div data-testid="in-progress-sub-tab" />
  )),
}));

vi.mock('@/components/plc/tabs/PlcAssignmentsCompletedSubTab', () => ({
  PlcAssignmentsCompletedSubTab: vi.fn(() => (
    <div data-testid="completed-sub-tab" />
  )),
}));

// Mock the authoring modals
vi.mock('@/components/plc/authoring/PlcAuthorQuizModal', () => ({
  PlcAuthorQuizModal: vi.fn(
    ({
      isOpen,
      onClose,
    }: {
      isOpen: boolean;
      onClose: () => void;
      plc?: unknown;
    }) =>
      isOpen ? (
        <div data-testid="author-quiz-modal">
          <button onClick={onClose}>Close Author Quiz</button>
        </div>
      ) : null
  ),
}));

vi.mock('@/components/plc/authoring/PlcAuthorVideoActivityModal', () => ({
  PlcAuthorVideoActivityModal: vi.fn(
    ({
      isOpen,
      onClose,
    }: {
      isOpen: boolean;
      onClose: () => void;
      plc?: unknown;
    }) =>
      isOpen ? (
        <div data-testid="author-video-modal">
          <button onClick={onClose}>Close Author Video</button>
        </div>
      ) : null
  ),
}));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '6th Grade ELA',
  leadUid: 'uid-a',
  memberUids: ['uid-a'],
  memberEmails: { 'uid-a': 'alice@school.edu' },
  createdAt: 1000,
  updatedAt: 2000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcAssignmentsSection', () => {
  it('renders Library, In-progress, and Completed sub-tab buttons', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    expect(screen.getByRole('tab', { name: /library/i })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /in-progress/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /completed/i })).toBeInTheDocument();
  });

  it('shows LibrarySubTab by default', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    expect(screen.getByTestId('library-sub-tab')).toBeInTheDocument();
  });

  it('renders "Create Quiz" and "Create Video" CTA buttons in the header', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    // Multiple buttons with "Create Quiz" text exist (header + mock sub-tab).
    // Assert at least one matches the exact label text.
    expect(screen.getAllByText('Create Quiz').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Create Video').length).toBeGreaterThanOrEqual(
      1
    );
  });

  it('opens PlcAuthorQuizModal when "Create Quiz" header CTA is clicked', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    // Use getByTitle to target the header CTA precisely (it has a title attr)
    fireEvent.click(
      screen.getByTitle('Author a new quiz and assign it in this PLC.')
    );
    expect(screen.getByTestId('author-quiz-modal')).toBeInTheDocument();
  });

  it('opens PlcAuthorVideoActivityModal when "Create Video" header CTA is clicked', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    fireEvent.click(
      screen.getByTitle(
        'Author a new video activity and assign it in this PLC.'
      )
    );
    expect(screen.getByTestId('author-video-modal')).toBeInTheDocument();
  });

  it('opens PlcAuthorQuizModal from the library sub-tab empty-state CTA', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    // The mock LibrarySubTab renders buttons that call the passed callbacks
    fireEvent.click(screen.getByText('Open Create Quiz'));
    expect(screen.getByTestId('author-quiz-modal')).toBeInTheDocument();
  });

  it('opens PlcAuthorVideoActivityModal from the library sub-tab CTA', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    fireEvent.click(screen.getByText('Open Create Video'));
    expect(screen.getByTestId('author-video-modal')).toBeInTheDocument();
  });

  it('closes PlcAuthorQuizModal when its onClose is called', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    fireEvent.click(
      screen.getByTitle('Author a new quiz and assign it in this PLC.')
    );
    expect(screen.getByTestId('author-quiz-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close Author Quiz'));
    expect(screen.queryByTestId('author-quiz-modal')).not.toBeInTheDocument();
  });

  it('switches to In-progress sub-tab when clicked', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    fireEvent.click(screen.getByRole('tab', { name: /in-progress/i }));
    expect(screen.getByTestId('in-progress-sub-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('library-sub-tab')).not.toBeInTheDocument();
  });

  it('switches to Completed sub-tab when clicked', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    fireEvent.click(screen.getByRole('tab', { name: /completed/i }));
    expect(screen.getByTestId('completed-sub-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('library-sub-tab')).not.toBeInTheDocument();
  });

  it('hides the Create CTAs when the In-progress sub-tab is active', () => {
    render(<PlcAssignmentsSection plc={fakePlc} />);
    fireEvent.click(screen.getByRole('tab', { name: /in-progress/i }));
    expect(
      screen.queryByRole('button', { name: /create quiz/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /create video/i })
    ).not.toBeInTheDocument();
  });
});
