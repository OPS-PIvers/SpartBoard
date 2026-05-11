import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse } from '@/types';

// Hook stubs mirror QuizResults.regenerate.test.tsx — we only need the
// surface area QuizResults reaches during render + Export click.
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
    googleAccessToken: 'token-1',
    user: { uid: 'user-1' },
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
  useAssignmentPseudonyms: () => ({ byStudentUid: new Map() }),
}));
vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

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
import { PlcSheetSchemaMismatchError } from '@/utils/quizDriveService';

const PLC_SHEET_URL = 'https://docs.google.com/spreadsheets/d/plc-sheet';
const RECOVERY_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/recovery-sheet';

function makeQuiz(): QuizData {
  return {
    id: 'quiz-1',
    title: 'Sample Quiz',
    questions: [
      {
        id: 'q1',
        type: 'MC',
        text: 'Q1 — added in member copy',
        correctAnswer: 'a',
        incorrectAnswers: ['b'],
        timeLimit: 30,
        points: 1,
      },
      {
        id: 'q2',
        type: 'MC',
        text: 'Q2',
        correctAnswer: 'c',
        incorrectAnswers: ['d'],
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

function makePlcConfig(): QuizConfig {
  return {
    view: 'results',
    plcMode: true,
    teacherName: 'Teacher A',
  } as unknown as QuizConfig;
}

// Header arrays the production code would generate. The "existing" array
// represents what's currently in the shared sheet (built when the lead's
// quiz had only Q1). The "expected" array is what the member's *current*
// quiz produces (Q1 text changed + Q2 added) — the divergence that
// triggers the mismatch in copy-mode PLC quizzes.
const EXISTING_HEADERS = [
  'Timestamp',
  'Teacher',
  'Class Period',
  'Student',
  'PIN',
  'Status',
  'Score (%)',
  'Points Earned',
  'Max Points',
  'Warnings',
  'Submitted At',
  'Q1 (1pt): Q1 (lead original wording)',
];
const EXPECTED_HEADERS = [
  'Timestamp',
  'Teacher',
  'Class Period',
  'Student',
  'PIN',
  'Status',
  'Score (%)',
  'Points Earned',
  'Max Points',
  'Warnings',
  'Submitted At',
  'Q1 (1pt): Q1 — added in member copy',
  'Q2 (1pt): Q2',
];

describe('QuizResults — PLC schema mismatch recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExportResultsToSheet.mockReset();
  });

  it('renders a column-specific diff in the export-error banner when PlcSheetSchemaMismatchError fires', async () => {
    mockExportResultsToSheet.mockRejectedValueOnce(
      new PlcSheetSchemaMismatchError(
        'This PLC sheet was created with an older schema and cannot be appended to safely.',
        EXISTING_HEADERS,
        EXPECTED_HEADERS
      )
    );

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('1111')]}
        config={makePlcConfig()}
        onBack={vi.fn()}
        plcSheetUrl={PLC_SHEET_URL}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));

    // The banner has to call out *what* differs so the teacher / admin can
    // tell at a glance whether the gap is a column-count drift or a single
    // edited question. A length difference shows up as the "N vs M columns"
    // copy. The two arrays differ in length (12 vs 13) so the banner must
    // mention both counts.
    await waitFor(() => {
      expect(
        screen.getByText(/12 column.*your quiz produces 13/i)
      ).toBeInTheDocument();
    });
  });

  it('shows an "Export to my own sheet" recovery button when the schema mismatch banner is visible', async () => {
    mockExportResultsToSheet.mockRejectedValueOnce(
      new PlcSheetSchemaMismatchError(
        'Schema mismatch.',
        EXISTING_HEADERS,
        EXPECTED_HEADERS
      )
    );

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('1111')]}
        config={makePlcConfig()}
        onBack={vi.fn()}
        plcSheetUrl={PLC_SHEET_URL}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /export to my own sheet/i })
      ).toBeInTheDocument();
    });
  });

  it('clicking the recovery button calls exportResultsToSheet with plcMode false and renders the resulting URL', async () => {
    mockExportResultsToSheet
      .mockRejectedValueOnce(
        new PlcSheetSchemaMismatchError(
          'Schema mismatch.',
          EXISTING_HEADERS,
          EXPECTED_HEADERS
        )
      )
      .mockResolvedValueOnce(RECOVERY_SHEET_URL);

    // Crucial: the recovery export must NOT persist via onExportUrlSaved.
    // That callback writes to the assignment doc's PLC export URL; the
    // recovery sheet is a personal Drive doc for manual merge and should
    // not become the assignment's canonical export. Without this guard
    // the next session rehydrates with the wrong URL and re-fires the
    // recovery loop.
    const onExportUrlSaved = vi.fn().mockResolvedValue(undefined);

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('1111'), makeResponse('2222')]}
        config={makePlcConfig()}
        onBack={vi.fn()}
        plcSheetUrl={PLC_SHEET_URL}
        onExportUrlSaved={onExportUrlSaved}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /export to my own sheet/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /export to my own sheet/i })
    );

    await waitFor(() => {
      expect(mockExportResultsToSheet).toHaveBeenCalledTimes(2);
    });

    const recoveryCallOpts = mockExportResultsToSheet.mock.calls[1][3] as {
      plcMode: boolean;
      plcSheetUrl: string | undefined;
    };
    expect(recoveryCallOpts.plcMode).toBe(false);
    expect(recoveryCallOpts.plcSheetUrl).toBeUndefined();

    // Banner must surface the resulting URL so the user can open and copy.
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /open my sheet/i });
      expect(link).toHaveAttribute('href', RECOVERY_SHEET_URL);
    });

    // Assignment doc's PLC export URL stays untouched.
    expect(onExportUrlSaved).not.toHaveBeenCalled();
  });
});
