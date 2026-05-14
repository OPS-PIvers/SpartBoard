import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse } from '@/types';

// Locks in the solo Re-Export Sheet affordance — previously absent, which
// left teachers with no in-app path to refresh a sheet after deleting it or
// after a code-side change to export output (e.g. the multi-class name
// resolution fix). The PLC equivalent is covered by QuizResults.regenerate.

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast,
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    googleAccessToken: 'token-1',
    user: { uid: 'teacher-self' },
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
vi.mock('@/components/common/library/PlcTab', () => ({
  PlcTab: () => <div data-testid="plc-tab-stub" />,
}));
vi.mock('@/utils/plcContributions', () => ({
  publishPlcContribution: vi.fn().mockResolvedValue(undefined),
}));

const mockExportResultsToSheet = vi.fn();
vi.mock('@/utils/quizDriveService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizDriveService')>();
  class MockQuizDriveService {
    exportResultsToSheet = mockExportResultsToSheet;
    createPlcSheetAndShare = vi.fn();
    regeneratePlcSheet = vi.fn();
  }
  return {
    ...actual,
    QuizDriveService: MockQuizDriveService,
  };
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

function makeResponse(pin: string): QuizResponse {
  return {
    studentUid: `uid-${pin}`,
    pin,
    classPeriod: 'Period 1',
    answers: [{ questionId: 'q1', answer: 'a', timestamp: 100 }],
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings: 0,
  } as unknown as QuizResponse;
}

function soloConfig(): QuizConfig {
  return {
    view: 'results',
    plcMode: false,
    teacherName: 'Teacher Self',
  } as unknown as QuizConfig;
}

describe('QuizResults — solo Re-Export Sheet button', () => {
  beforeEach(() => {
    addToast.mockClear();
    mockExportResultsToSheet.mockClear();
  });

  it('does not render the Re-Export button before the first export (initialExportUrl is null)', () => {
    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('01')]}
        config={soloConfig()}
        onBack={vi.fn()}
        plcId={null}
        syncGroupId={null}
        initialExportUrl={null}
      />
    );

    // Initial-state path: only the EXPORT TO SHEETS button is offered.
    expect(
      screen.queryByRole('button', {
        name: /re-export sheet \(creates a new sheet\)/i,
      })
    ).toBeNull();
  });

  it('renders the Re-Export button when solo mode has an initialExportUrl', () => {
    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('01')]}
        config={soloConfig()}
        onBack={vi.fn()}
        plcId={null}
        syncGroupId={null}
        initialExportUrl="https://docs.google.com/spreadsheets/d/OLD/edit"
      />
    );

    expect(
      screen.getByRole('button', {
        name: /re-export sheet \(creates a new sheet\)/i,
      })
    ).toBeInTheDocument();
    // OPEN SHEET is rendered alongside it so the teacher can still navigate
    // to (or recover) the previous sheet if needed.
    expect(screen.getByRole('link', { name: /open sheet/i })).toHaveAttribute(
      'href',
      'https://docs.google.com/spreadsheets/d/OLD/edit'
    );
  });

  it('clicking Re-Export calls exportResultsToSheet with plcMode false and shows a re-export toast', async () => {
    mockExportResultsToSheet.mockResolvedValue(
      'https://docs.google.com/spreadsheets/d/NEW/edit'
    );
    const onExportUrlSaved = vi.fn().mockResolvedValue(undefined);
    const onExportedResponseIdsSaved = vi.fn().mockResolvedValue(undefined);

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('01')]}
        config={soloConfig()}
        onBack={vi.fn()}
        plcId={null}
        syncGroupId={null}
        initialExportUrl="https://docs.google.com/spreadsheets/d/OLD/edit"
        onExportUrlSaved={onExportUrlSaved}
        onExportedResponseIdsSaved={onExportedResponseIdsSaved}
      />
    );

    const button = screen.getByRole('button', {
      name: /re-export sheet \(creates a new sheet\)/i,
    });
    await act(async () => {
      button.click();
      // Flush the await chain inside handleExport.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockExportResultsToSheet).toHaveBeenCalledTimes(1);
    const callArgs = mockExportResultsToSheet.mock.calls[0];
    // 4th arg is the exportOpts bag — plcMode must be false on a solo
    // re-export, otherwise the call routes through the PLC append path and
    // throws when no plcSheetUrl is provided.
    expect(callArgs[3]).toMatchObject({ plcMode: false });

    expect(addToast).toHaveBeenCalledWith(
      expect.stringMatching(/re-exported.*previous sheet remains/i),
      'success'
    );
    // The new URL was persisted upstream so a remount doesn't rehydrate
    // the stale URL into the OPEN SHEET link.
    expect(onExportUrlSaved).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/NEW/edit'
    );
  });
});
