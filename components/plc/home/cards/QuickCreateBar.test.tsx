/**
 * Render test for QuickCreateBar (Wave 3 — PRD §6.3, Decision 4.2).
 *
 * The three Home quick-create buttons must OPEN the existing in-PLC authoring
 * modals (not navigate):
 *
 *   "Assign quiz"           → PlcNewQuizAssignmentModal
 *   "Assign video activity" → PlcNewVideoActivityAssignmentModal
 *   "Add a doc"             → PlcAddDocModal
 *
 * Each modal is mocked to a sentinel so we can assert it mounts on click
 * without booting the authoring stack / Firebase. The two assignment buttons
 * are gated on a connected Drive + a non-empty personal library; we make both
 * available so the buttons are active, and separately assert the disabled
 * affordance (aria-disabled + reason) when Drive is missing.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Plc } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown>) => {
      let template = (o?.defaultValue as string) ?? _k;
      if (o) {
        for (const [key, value] of Object.entries(o)) {
          if (key === 'defaultValue') continue;
          template = template.replace(
            new RegExp(`{{${key}}}`, 'g'),
            String(value)
          );
        }
      }
      return template;
    },
  }),
}));

const getAssignmentMode = vi.fn(() => 'plc');
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-alice' },
    getAssignmentMode,
  }),
}));

let quizDriveConnected = true;
let videoDriveConnected = true;
let quizCount = 2;
let videoCount = 2;
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    quizzes: Array.from({ length: quizCount }, (_, i) => ({ id: `quiz-${i}` })),
    isDriveConnected: quizDriveConnected,
  }),
}));
vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    activities: Array.from({ length: videoCount }, (_, i) => ({
      id: `va-${i}`,
    })),
    isDriveConnected: videoDriveConnected,
  }),
}));

// Modal sentinels — assert mount + that close clears state.
vi.mock('@/components/plc/PlcNewQuizAssignmentModal', () => ({
  PlcNewQuizAssignmentModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="quiz-modal">
      <button type="button" onClick={onClose}>
        close-quiz
      </button>
    </div>
  ),
}));
vi.mock('@/components/plc/PlcNewVideoActivityAssignmentModal', () => ({
  PlcNewVideoActivityAssignmentModal: ({
    onClose,
  }: {
    onClose: () => void;
  }) => (
    <div data-testid="video-modal">
      <button type="button" onClick={onClose}>
        close-video
      </button>
    </div>
  ),
}));
vi.mock('@/components/plc/docs/PlcAddDocModal', () => ({
  PlcAddDocModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="doc-modal">
      <button type="button" onClick={onClose}>
        close-doc
      </button>
    </div>
  ),
}));

import { QuickCreateBar } from './QuickCreateBar';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-alice',
  members: {
    'uid-alice': {
      uid: 'uid-alice',
      email: 'alice@school.edu',
      displayName: 'Alice',
      role: 'lead',
      joinedAt: 1000,
      status: 'active',
    },
  },
  memberUids: ['uid-alice'],
  memberEmails: { 'uid-alice': 'alice@school.edu' },
  createdAt: 1000,
  updatedAt: 2000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuickCreateBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quizDriveConnected = true;
    videoDriveConnected = true;
    quizCount = 2;
    videoCount = 2;
  });

  it('renders all three quick-create buttons', () => {
    render(<QuickCreateBar plc={fakePlc} onNavigate={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /assign quiz/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /assign video activity/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add a doc/i })
    ).toBeInTheDocument();
  });

  it('opens the quiz assignment modal when "Assign quiz" is clicked', () => {
    render(<QuickCreateBar plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.queryByTestId('quiz-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /assign quiz/i }));
    expect(screen.getByTestId('quiz-modal')).toBeInTheDocument();
  });

  it('opens the video activity assignment modal when "Assign video activity" is clicked', () => {
    render(<QuickCreateBar plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.queryByTestId('video-modal')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /assign video activity/i })
    );
    expect(screen.getByTestId('video-modal')).toBeInTheDocument();
  });

  it('opens the add-doc modal when "Add a doc" is clicked', () => {
    render(<QuickCreateBar plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.queryByTestId('doc-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add a doc/i }));
    expect(screen.getByTestId('doc-modal')).toBeInTheDocument();
  });

  it('closes a modal when its onClose fires', () => {
    render(<QuickCreateBar plc={fakePlc} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add a doc/i }));
    expect(screen.getByTestId('doc-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-doc'));
    expect(screen.queryByTestId('doc-modal')).not.toBeInTheDocument();
  });

  it('opens only one modal at a time', () => {
    render(<QuickCreateBar plc={fakePlc} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /assign quiz/i }));
    expect(screen.getByTestId('quiz-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('video-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('doc-modal')).not.toBeInTheDocument();
  });

  it('disables the quiz button (aria-disabled + reason) when Drive is not connected and does not open the modal', () => {
    quizDriveConnected = false;
    render(<QuickCreateBar plc={fakePlc} onNavigate={vi.fn()} />);
    const quizBtn = screen.getByRole('button', { name: /assign quiz/i });
    expect(quizBtn).toHaveAttribute('aria-disabled', 'true');
    expect(quizBtn).toHaveAttribute('aria-describedby');
    fireEvent.click(quizBtn);
    expect(screen.queryByTestId('quiz-modal')).not.toBeInTheDocument();
  });

  it('disables the video button when the personal library is empty', () => {
    videoCount = 0;
    render(<QuickCreateBar plc={fakePlc} onNavigate={vi.fn()} />);
    const videoBtn = screen.getByRole('button', {
      name: /assign video activity/i,
    });
    expect(videoBtn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(videoBtn);
    expect(screen.queryByTestId('video-modal')).not.toBeInTheDocument();
  });
});
