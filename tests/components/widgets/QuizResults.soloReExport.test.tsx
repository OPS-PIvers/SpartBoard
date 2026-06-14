import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse } from '@/types';

// Locks in the solo Re-Export Sheet affordance — without it, teachers had no
// in-app path to refresh a sheet after deleting it or after a code-side
// change to export output. The PLC equivalent is covered by
// QuizResults.regenerate.

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

  afterEach(() => {
    // Restore any vi.spyOn (e.g. window.open) even if a test throws first.
    vi.restoreAllMocks();
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

    // The Re-Export and Open Sheet actions now live in the overflow (kebab)
    // menu — open it before asserting they're present.
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));

    expect(
      screen.getByRole('menuitem', {
        name: /re-export sheet \(creates a new sheet\)/i,
      })
    ).toBeInTheDocument();
    // OPEN SHEET is offered alongside it so the teacher can still navigate
    // to (or recover) the previous sheet if needed.
    expect(
      screen.getByRole('menuitem', { name: /open sheet/i })
    ).toBeInTheDocument();
  });

  it('clicking Open Sheet opens the export URL in a new tab', () => {
    const exportUrl = 'https://docs.google.com/spreadsheets/d/OLD/edit';
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('01')]}
        config={soloConfig()}
        onBack={vi.fn()}
        plcId={null}
        syncGroupId={null}
        initialExportUrl={exportUrl}
      />
    );

    // Open Sheet now lives in the overflow menu: open the kebab, then click it.
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /open sheet/i }));

    expect(openSpy).toHaveBeenCalledWith(
      exportUrl,
      '_blank',
      'noopener,noreferrer'
    );

    openSpy.mockRestore();
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

    // Re-Export now lives in the overflow menu: open the kebab, then click it.
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: /re-export sheet \(creates a new sheet\)/i,
      })
    );

    await waitFor(() => {
      expect(mockExportResultsToSheet).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockExportResultsToSheet.mock.calls[0];
    // 4th arg is the exportOpts bag — plcMode must be false on a solo
    // re-export, otherwise the call routes through the PLC append path and
    // throws when no plcSheetUrl is provided.
    expect(callArgs[3]).toMatchObject({ plcMode: false });

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.stringMatching(/re-exported.*previous sheet remains/i),
        'success'
      );
    });
    // The new URL was persisted upstream so a remount doesn't rehydrate
    // the stale URL into the OPEN SHEET link.
    expect(onExportUrlSaved).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/NEW/edit'
    );
  });

  it('does NOT fire the re-export toast when this is the first export (no previousExportUrl)', async () => {
    mockExportResultsToSheet.mockResolvedValue(
      'https://docs.google.com/spreadsheets/d/FIRST/edit'
    );
    const onExportUrlSaved = vi.fn().mockResolvedValue(undefined);

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('01')]}
        config={soloConfig()}
        onBack={vi.fn()}
        plcId={null}
        syncGroupId={null}
        initialExportUrl={null}
        onExportUrlSaved={onExportUrlSaved}
      />
    );

    // First-export path uses the plain "Export to Sheets" overflow item (not
    // Re-Export): open the kebab, then click it.
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: /export to sheets/i })
    );

    await waitFor(() => {
      expect(mockExportResultsToSheet).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onExportUrlSaved).toHaveBeenCalled();
    });

    // The "Re-exported" toast must NOT fire on the first export — that
    // wording is reserved for the case where a previous sheet existed.
    const reExportCalls = addToast.mock.calls.filter(([msg]) =>
      typeof msg === 'string' ? /re-exported/i.test(msg) : false
    );
    expect(reExportCalls).toHaveLength(0);
  });

  it('surfaces an error toast and keeps the previous URL when re-export rejects', async () => {
    mockExportResultsToSheet.mockRejectedValue(new Error('Drive 500'));
    const onExportUrlSaved = vi.fn().mockResolvedValue(undefined);

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
      />
    );

    // Re-Export now lives in the overflow menu: open the kebab, then click it.
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: /re-export sheet \(creates a new sheet\)/i,
      })
    );

    await waitFor(() => {
      const errorCalls = addToast.mock.calls.filter(
        ([, kind]) => kind === 'error'
      );
      expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    });

    // The previous-URL persistence callback must NOT fire on failure —
    // otherwise the teacher's OPEN SHEET link would point at a sheet that
    // never came to exist.
    expect(onExportUrlSaved).not.toHaveBeenCalled();
    // No success toast either.
    const successCalls = addToast.mock.calls.filter(
      ([, kind]) => kind === 'success'
    );
    expect(successCalls).toHaveLength(0);
  });
});
