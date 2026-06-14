import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse, QuizSession } from '@/types';

// Hook stub set mirrors QuizResults.regenerate.test.tsx — only the surface
// QuizResults reaches during render + Students-tab interaction. The
// QuizDriveService mock is unused here (no export click), but registering it
// avoids the real module pulling in `googleapis` during the render pass.
const addToast = vi.fn();
const updateWidget = vi.fn();
const addWidget = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget,
    addWidget,
    addToast,
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    googleAccessToken: null,
    user: { uid: 'teacher-1' },
    orgId: null,
  }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [],
    clearPlcSharedSheetUrl: vi.fn(),
    setPlcSharedSheetUrl: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
  }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));
vi.mock('@/utils/quizDriveService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizDriveService')>();
  class MockQuizDriveService {
    exportResultsToSheet = vi.fn();
    createPlcSheetAndShare = vi.fn();
    regeneratePlcSheet = vi.fn();
  }
  return { ...actual, QuizDriveService: MockQuizDriveService };
});

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

function makeQuiz(): QuizData {
  return {
    id: 'quiz-1',
    title: 'Sample Quiz',
    questions: [
      {
        id: 'q1',
        type: 'MC',
        text: 'Q1',
        correctAnswer: 'a',
        incorrectAnswers: ['b'],
        timeLimit: 30,
        points: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeLockedResponse(pin: string): QuizResponse {
  return {
    studentUid: `uid-${pin}`,
    _responseKey: `pin-Period 1-${pin}`,
    pin,
    classPeriod: 'Period 1',
    answers: [{ questionId: 'q1', answer: 'a', timestamp: 100 }],
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings: 0,
    resultsTabWarnings: 3,
    resultsLockedOut: true,
    resultsLockedOutAt: 1700000000000,
  } as unknown as QuizResponse;
}

function makeConfig(): QuizConfig {
  return { view: 'results', teacherName: 'Teacher A' } as unknown as QuizConfig;
}

function makeSession(): QuizSession {
  return {
    id: 'session-1',
    quizId: 'quiz-1',
    teacherUid: 'teacher-1',
    classIds: [],
    protection: {
      watermarkEnabled: false,
      tabWarningEnabled: true,
      tabWarningThreshold: 3,
    },
  } as unknown as QuizSession;
}

describe('QuizResults — Students tab results-lockout unlock control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Locked badge and Unlock button for a locked-out student, and invokes the callback + success toast on click', async () => {
    const onUnlockResultsForStudent = vi.fn().mockResolvedValue(undefined);
    const response = makeLockedResponse('1111');

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[response]}
        config={makeConfig()}
        onBack={vi.fn()}
        session={makeSession()}
        tabWarningsEnabled
        onUnlockResultsForStudent={onUnlockResultsForStudent}
      />
    );

    // Default tab is overview — switch to Students. The SegmentedTabs control
    // renders each tab with role="tab" and the label as its accessible name.
    fireEvent.click(screen.getByRole('tab', { name: /^students$/i }));

    // Students tab gates the per-student rows behind a Show/Hide toggle so a
    // teacher doesn't accidentally project scores. Reveal them so the
    // locked-out row mounts.
    fireEvent.click(screen.getByRole('button', { name: /show results/i }));

    // Badge: "Locked (3/3)" — currentWarnings/threshold from the response +
    // session.protection. The aria-label is the stable selector.
    const badge = await screen.findByLabelText('Results locked');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/Locked\s*\(3\/3\)/);

    // Button: amber CTA next to the row.
    const unlockButton = screen.getByRole('button', {
      name: /unlock results for/i,
    });
    expect(unlockButton).toBeInTheDocument();

    fireEvent.click(unlockButton);

    // Callback must receive the deterministic doc key (_responseKey),
    // NOT the studentUid — the unlock function in useQuizSession indexes
    // into /quiz_sessions/{sessionId}/responses/{responseKey}.
    await waitFor(() => {
      expect(onUnlockResultsForStudent).toHaveBeenCalledTimes(1);
    });
    expect(onUnlockResultsForStudent).toHaveBeenCalledWith('pin-Period 1-1111');

    // Success toast copy matches QuizLiveMonitor's so teachers see
    // consistent messaging across the live and results surfaces.
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.stringMatching(/can view results again.*re-lock/i),
        'success'
      );
    });
  });

  it('surfaces an error toast and does not crash when the unlock callback rejects', async () => {
    const onUnlockResultsForStudent = vi
      .fn()
      .mockRejectedValue(new Error('Firestore offline'));
    const response = makeLockedResponse('2222');

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[response]}
        config={makeConfig()}
        onBack={vi.fn()}
        session={makeSession()}
        tabWarningsEnabled
        onUnlockResultsForStudent={onUnlockResultsForStudent}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /^students$/i }));
    fireEvent.click(screen.getByRole('button', { name: /show results/i }));

    const unlockButton = await screen.findByRole('button', {
      name: /unlock results for/i,
    });
    fireEvent.click(unlockButton);

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.stringMatching(/could not unlock.*try again/i),
        'error'
      );
    });
  });

  it('does not render the Unlock button when the student is not locked out', () => {
    const onUnlockResultsForStudent = vi.fn();
    const response = {
      ...makeLockedResponse('3333'),
      resultsLockedOut: false,
      resultsTabWarnings: 1,
    } as QuizResponse;

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[response]}
        config={makeConfig()}
        onBack={vi.fn()}
        session={makeSession()}
        tabWarningsEnabled
        onUnlockResultsForStudent={onUnlockResultsForStudent}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /^students$/i }));
    fireEvent.click(screen.getByRole('button', { name: /show results/i }));

    // The student row mounts (verify by looking for the score), but neither
    // the badge nor the unlock button should be present — the lock UI is
    // strictly gated on `resultsLockedOut === true`.
    expect(screen.queryByLabelText('Results locked')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /unlock results for/i })
    ).not.toBeInTheDocument();
    expect(onUnlockResultsForStudent).not.toHaveBeenCalled();
  });
});
